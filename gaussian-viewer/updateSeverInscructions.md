# Deployment Guide for Gaussian Viewer

## Quick Steps for Konnor
1. SSH into the server:
```bash
ssh konnor@76.135.164.17
```

2. Take ownership of the directory (only needed once or if permissions get messed up):
```bash
sudo chown -R konnor:konnor /var/www/konnorkooi.com/gaussian-viewer/
sudo chmod -R 755 /var/www/konnorkooi.com/gaussian-viewer/
```

3. Deploy new changes (run these from your local machine):
```bash
# Remove old files
ssh konnor@76.135.164.17 "rm -rf /var/www/konnorkooi.com/gaussian-viewer/*"

# Copy new files
scp -r gaussian-viewer/* konnor@76.135.164.17:/var/www/konnorkooi.com/gaussian-viewer/
```

4. Check Apache status:
```bash
sudo systemctl status apache2
```

5. If needed, restart apache