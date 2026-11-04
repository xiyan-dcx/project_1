import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const contract = JSON.parse(await readFile(new URL('../portal_contract.json', import.meta.url), 'utf8'))
const { pageBasePath, apiBasePath, backendOrigin, backendApiPath } = contract
// Values enter nginx configuration verbatim; accept only simple path segments
// and HTTP origins so configuration edits cannot insert nginx directives.
if (!/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(pageBasePath)
  || !/^\/[a-zA-Z0-9_/-]+$/.test(apiBasePath)
  || !/^\/[a-zA-Z0-9_/-]+$/.test(backendApiPath)
  || !/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(backendOrigin)) {
  throw new Error('Invalid portal path or backend origin in portal_contract.json')
}
const destination = new URL('../../../dist/portal-config/', import.meta.url)
const config = `# Generated from packages/config/portal_contract.json.
# Include inside the portal's existing server block.
# Copy apps/scheduler-display/dist-portal/ contents to /var/www/scheduler-display/.
location = ${pageBasePath.slice(0, -1)} {
    absolute_redirect off;
    return 301 ${pageBasePath};
}

location ^~ ${apiBasePath}/ {
    proxy_pass ${backendOrigin}${backendApiPath}/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    add_header X-Accel-Buffering no;
}

location ^~ ${pageBasePath}assets/ {
    alias /var/www/scheduler-display/assets/;
    try_files $uri =404;
}

location ^~ ${pageBasePath} {
    alias /var/www/scheduler-display/;
    try_files $uri $uri/ ${pageBasePath}index.html;
    add_header Cache-Control "no-store";
}
`
await mkdir(destination, { recursive: true })
const output = new URL('scheduler-display.conf', destination)
await writeFile(output, config, 'utf8')
console.log(`Portal nginx config: ${fileURLToPath(output)}`)
