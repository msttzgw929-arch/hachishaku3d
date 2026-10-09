import asyncio, sys
from playwright.async_api import async_playwright
# usage: shot.py url out.png [w h] [waitjs]
async def main():
    url, out = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 800; h = int(sys.argv[4]) if len(sys.argv) > 4 else 800
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': w, 'height': h}); pg.set_default_timeout(120000)
        pg.on('console', lambda m: print('CONSOLE', m.type, m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto(url); await pg.wait_for_function('window.done===true')
        await pg.screenshot(path=out); await b.close()
asyncio.run(main())
