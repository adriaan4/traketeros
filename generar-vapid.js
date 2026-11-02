// Genera las claves para los avisos push al admin. Se ejecuta UNA vez en tu ordenador:
//     node generar-vapid.js
// y se copian las dos líneas a las variables de entorno de Render. La privada no se comparte.
import crypto from 'crypto';

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);

console.log('VAPID_PUBLIC_KEY=' + pub.toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
console.log('VAPID_SUBJECT=mailto:tu-correo@ejemplo.com   (opcional)');
