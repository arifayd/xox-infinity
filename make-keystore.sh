#!/bin/bash
keytool -genkey -v -keystore ~/xox/xox-arena-backend/xox-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias xox-key -dname "CN=XOX, OU=Unknown, O=Unknown, L=Trabzon, ST=Trabzon, C=TR" -storepass Xox12345 -keypass Xox12345
echo ""
echo "✅ Keystore oluşturuldu!"
