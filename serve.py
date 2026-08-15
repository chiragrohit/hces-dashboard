"""
Serve the HCES dashboard locally.
Run: python serve.py
Then open: http://localhost:8080
Routes:
  /                -> dashboard overview (index.html)
  /consumption     -> consumption view
  /demographics    -> demographics view
  /households      -> households view
  /metadata        -> data catalog (metadata.html)
"""
import http.server
import os

PORT = 8080
os.chdir("web_dashboard")

DASHBOARD_PATHS = {"/", "/consumption", "/demographics", "/households"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in DASHBOARD_PATHS:
            self.path = "/index.html"
        elif self.path in ("/metadata", "/metadata/"):
            self.path = "/metadata.html"
        return super().do_GET()


print(f"HCES Dashboard running at http://localhost:{PORT}")
print("  /              Overview")
print("  /consumption   Consumption")
print("  /demographics  Demographics")
print("  /households    Households")
print("  /metadata      Data catalog")
print("Press Ctrl+C to stop")

httpd = http.server.HTTPServer(("", PORT), Handler)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
