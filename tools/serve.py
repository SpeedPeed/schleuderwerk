"""Startet einen kleinen Webserver für den Ordner www/, damit das Spiel im Handy-Browser
getestet werden kann. Handy und PC müssen im selben WLAN sein.

Start:  python tools/serve.py        (Beenden mit Strg+C)
"""
import http.server
import os
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "www")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # es wird nichts gesendet, nur die eigene Adresse ermittelt
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # immer die neueste Version laden
        super().end_headers()

    def log_message(self, *args):
        pass


Handler.extensions_map[".js"] = "text/javascript"

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print("Schleuderwerk läuft!")
    print(f"  Am PC:       http://localhost:{PORT}")
    print(f"  Am Handy:    http://{lan_ip()}:{PORT}   (gleiches WLAN)")
    print("Beenden mit Strg+C")
    httpd.serve_forever()
