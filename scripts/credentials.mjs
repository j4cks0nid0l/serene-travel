import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {stdout} from 'node:process';
// The password is generated locally and never written into the public website.
const password=randomBytes(24).toString('base64url');
const salt=randomBytes(24).toString('hex');
const digest=pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
stdout.write('Tài khoản: serenetravelvn@gmail.com\nMật khẩu mới (lưu trong trình quản lý mật khẩu): '+password+'\n\nCloudflare Secret ADMIN_PASSWORD_HASH:\n'+salt+':'+digest+'\n');
