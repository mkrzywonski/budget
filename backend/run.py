#!/usr/bin/env python3
"""
Entry point for running the Personal Finance Ledger server.

Usage:
    python run.py [--port PORT] [--host HOST]
"""

import argparse
import webbrowser
import qrcode
import io
import uvicorn


def print_qr_code(url: str) -> None:
    """Print a QR code to the terminal."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Print QR code using ASCII
    qr.print_ascii(invert=True)


def main():
    parser = argparse.ArgumentParser(description="Personal Finance Ledger")
    parser.add_argument("--port", type=int, default=8000, help="Port to run on")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"

    print("\n" + "=" * 50)
    print("  Personal Finance Ledger")
    print("=" * 50)
    print(f"\n  URL: {url}\n")

    try:
        print_qr_code(url)
    except Exception:
        pass  # QR code is optional

    print("\n  Press Ctrl+C to stop the server\n")
    print("=" * 50 + "\n")

    if not args.no_browser:
        webbrowser.open(url)

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
