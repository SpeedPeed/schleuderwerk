"""Erzeugt EINMALIG den festen Signaturschlüssel (keystore/debug.keystore) für die Debug-APK.

Warum? Android installiert ein Update nur, wenn es mit demselben Schlüssel signiert ist wie die
installierte App. Ein fester Schlüssel im Projekt sorgt dafür, dass jede neue APK – egal ob von
GitHub oder vom eigenen PC gebaut – einfach drüberinstalliert werden kann und der Spielstand bleibt.

Benötigt: pip install cryptography
Passwort: android · Alias: androiddebugkey (Android-Standard für Debug-Schlüssel)
"""
import datetime
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "keystore", "debug.keystore")
if os.path.exists(OUT) and "--force" not in sys.argv:
    sys.exit("keystore/debug.keystore existiert schon – NICHT neu erzeugen, sonst lassen sich Updates nicht mehr installieren.")

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Schleuderwerk Debug")])
now = datetime.datetime.now(datetime.timezone.utc)
cert = (
    x509.CertificateBuilder()
    .subject_name(name)
    .issuer_name(name)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - datetime.timedelta(days=1))
    .not_valid_after(now + datetime.timedelta(days=365 * 30))
    .sign(key, hashes.SHA256())
)
# Klassische PKCS12-Verschlüsselung, die jede Java-Version lesen kann
enc = (
    pkcs12.serialization.PrivateFormat.PKCS12.encryption_builder()
    .kdf_rounds(50000)
    .key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
    .hmac_hash(hashes.SHA1())
    .build(b"android")
)
data = pkcs12.serialize_key_and_certificates(b"androiddebugkey", key, cert, None, enc)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "wb") as f:
    f.write(data)
print("Gespeichert:", os.path.normpath(OUT))
