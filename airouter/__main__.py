"""CLI: `python -m airouter serve` or `python -m airouter selftest`."""
import argparse
import sys
import threading
import webbrowser


def main():
    ap = argparse.ArgumentParser(prog="airouter")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="run the web app")
    s.add_argument("--port", type=int, default=8400)
    s.add_argument("--no-browser", action="store_true")
    sub.add_parser("selftest", help="offline checks: router, provider interface, history")
    args = ap.parse_args()

    if args.cmd == "selftest":
        from .selftest import run
        sys.exit(run())

    import uvicorn
    from . import config
    if not config.WEB_DIST.exists():
        print("Note: web/dist not found. Run `npm install && npm run build` in web/ first.")
    url = f"http://127.0.0.1:{args.port}"
    print(f"AIRouter running at {url}")
    if not args.no_browser:
        threading.Timer(1.2, webbrowser.open, [url]).start()
    uvicorn.run("airouter.server:app", host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
