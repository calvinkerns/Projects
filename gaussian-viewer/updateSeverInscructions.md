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
scp -r gaussian-viewer/* konnor@:/var/www/konnorkooi.com/gaussian-viewer/
```

4. Check Apache status:
```bash
sudo systemctl status apache2
```

5. If needed, restart Apache:
```bash
1```

## Troubleshooting
- If you get permission denied errors, rerun the ownership commands from step 2
- If the website isn't updating, try clearing your browser cache or use incognito mode
- Check Apache logs if something isn't working:
```bash
sudo tail -f /var/log/apache2/error.log
```

## Important Notes
- Always test locally before deploying
- Make sure all files are copied correctly
- The website is served at: konnorkooi.com/gaussian-viewer/
- Keep these commands handy for future deployments

Remember: If you get stuck, you can always reach out to IT for help!