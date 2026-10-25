import { copyFileSync, existsSync } from 'node:fs';
// Never overwrite credentials or settings a developer has already configured.
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created local settings from the credential-free example. Saved-data demo mode is enabled.');
}
