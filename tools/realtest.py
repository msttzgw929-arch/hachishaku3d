# Real-time chase test (no fixed dt): mobile touch joystick or keyboard, optional CPU throttling,
# player follows a route around city blocks (corners) while she chases. Gap (player to belly surface) is logged every second.
# usage: python3 tools/realtest.py [base_url] [touch|keys] [stick_push_fraction] [stage] [lunge0|lunge1] [cpu_throttle] [seconds]
import asyncio, sys, json, math
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8123/'
MODE = sys.argv[2] if len(sys.argv) > 2 else 'touch'
PUSH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
STAGE = int(sys.argv[4]) if len(sys.argv) > 4 else 0
LUNGE = (sys.argv[5] if len(sys.argv) > 5 else 'lunge0') == 'lunge1'
CPU = float(sys.argv[6]) if len(sys.argv) > 6 else 2
SECS = float(sys.argv[7]) if len(sys.argv) > 7 else 12
# pace30: software GL in CI renders only ~5 fps, so game time runs slow (dt is clamped to 50 ms). pace30 ticks the game at 30 Hz
# with several ticks per rendered frame so game time keeps up with wall-clock time (input still arrives as real touch/key events).
PACE = (sys.argv[8] if len(sys.argv) > 8 else 'pace30') == 'pace30'
ROUTE = [(14, 98), (14, 70), (-14, 70), (-14, 42), (42, 42), (42, 14), (14, 14), (14, -14)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'])
        if MODE == 'touch': ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=1, is_mobile=True, has_touch=True)
        else: ctx = await b.new_context(viewport={'width': 960, 'height': 540})
        pg = await ctx.new_page(); pg.set_default_timeout(120000); ev = pg.evaluate
        errs = []
        pg.on('console', lambda m: m.type in ('error', 'warning') and 'GPU stall' not in m.text and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto(BASE + 'index.html'); await pg.wait_for_function('window.__ready===true')
        if MODE == 'touch': await pg.tap('#start-btn')
        else: await pg.click('#start-btn')
        await pg.wait_for_function("window.__game.S.mode==='play'")
        await pg.wait_for_timeout(800)
        if CPU > 1: await cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
        fa = await ev('()=>new Promise(r=>{let n=0;const t=performance.now();(function f(){n++;if(performance.now()-t<1500)requestAnimationFrame(f);else r(n/((performance.now()-t)/1000))})()})')
        steps = max(1, round(30 / fa)) if PACE else 1
        if PACE: await ev(f'window.__fixedDt=1/30;window.__simSteps={steps}')
        await ev(f"""()=>{{const g=window.__game,S=g.S;S.stage={STAGE};g.hachi.setStage({STAGE},true);S.irritation=95;S.invuln=0;S.hearts=3;
          S.pos.set({ROUTE[0][0]},0,{ROUTE[0][1]});S.vel.set(0,0,0);S.yaw=0;S.pitch=0.1;
          const R=g.hachi.radius,bs=g.hachi.bodyScale; S.h.pos.set({ROUTE[0][0]},0,{ROUTE[0][1]}+ (R-0.17)*bs*2 + R + 6); S.h.yaw=Math.PI; g.hachi.root.rotation.y=Math.PI; S.h.speed=0; S.h.lungeCd={'0' if LUNGE else '99'}; S.h.stun=0;
          window.__fr=0; window.__irrLock=setInterval(()=>{{S.irritation=Math.min(S.irritation,95); if({'true' if LUNGE else 'false'}){{S.h.lunge=9;}} }},50);
          (function f(){{window.__fr++;requestAnimationFrame(f)}})();
          window.__gap=()=>{{const c=g.hachi.bellyCenter(new g.camera.position.constructor());return Math.hypot(S.pos.x-c.x,S.pos.z-c.z)-g.hachi.radius}};
          window.__hmax=0; setInterval(()=>{{window.__hmax=Math.max(window.__hmax,S.h.speed)}},16);}}""")
        # start input
        if MODE == 'touch':
            sx, sy = 120, 300
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': sx, 'y': sy, 'id': 0}]})
            await pg.wait_for_timeout(50)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': sx, 'y': sy - 58 * PUSH, 'id': 0}]})
        else:
            await pg.keyboard.down('KeyW')
        wp = 1; log = []; grabbed = False; t = 0.0; f0 = await ev('window.__fr'); pz = []
        import time; T0 = time.time(); nextlog = 0
        while time.time() - T0 < SECS:
            st = await ev("()=>{const S=window.__game.S;return {x:S.pos.x,z:S.pos.z,mode:S.mode,v:Math.hypot(S.vel.x,S.vel.z),gap:window.__gap(),hv:S.h.speed}}")
            if st['mode'] != 'play': grabbed = True; break
            tx, tz = ROUTE[wp]
            if math.hypot(tx - st['x'], tz - st['z']) < 2.5 and wp < len(ROUTE) - 1: wp += 1; tx, tz = ROUTE[wp]
            yaw = math.atan2(-(tx - st['x']), -(tz - st['z']))
            await ev(f"window.__game.S.yaw={yaw}")
            el = time.time() - T0
            if el >= nextlog: log.append((round(el, 1), round(st['gap'], 1), round(st['v'], 2), round(st['hv'], 2))); nextlog += 1
            await pg.wait_for_timeout(60)
        fr = (await ev('window.__fr')) - f0; el = time.time() - T0
        hmax = await ev('window.__hmax')
        if MODE == 'touch': await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else: await pg.keyboard.up('KeyW')
        print(json.dumps({'mode': MODE, 'push': PUSH, 'stage': STAGE, 'lunge': LUNGE, 'cpu': CPU, 'fps': round(fr / el, 1), 'ticks_per_frame': steps, 'game_s_per_real_s': round(steps * fr / el / 30, 2) if PACE else None, 'grabbed': grabbed, 'waypoint': wp, 'her_max': round(hmax, 2)}))
        print('t, gap, player_v, her_v'); [print(x) for x in log]
        grow = (not grabbed) and len(log) > 2 and log[-1][1] > log[0][1]
        print('GAP_GROWS', grow, 'ERRORS', len(errs)); [print('ERR', e) for e in errs[:5]]
        await b.close()
asyncio.run(main())
