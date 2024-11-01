# Introduction
This script automates the ATAK TPP process using Puppeteer. 
**Note:** This only works on Linux machines and Windows Subsystem for Linux (WSL)!

# Setup Instructions

1. Create an `.env` file using `template.env` as an example

2. Install `oathtool`:
   ```bash
   sudo apt install oathtool
   ```
   For more information, visit: https://packages.debian.org/sid/oathtool

3. Authentication Setup:
   - Create a new account or use an existing one
   - Add your credentials to `.env`:
     - Set `USER_NAME`
     - Set `USER_PASS`

4. Two-Factor Authentication:
   - Navigate to "Mobile Authenticator Setup"
   - Click "Unable to scan?" to view the secret code
   - Copy the secret code (remove any spaces)
   - Generate a one-time code using:
     ```bash
     oathtool --totp -b YOUR_SECRET
     ```

5. Build and Run:
   ```bash
   yarn build
   # or
   npm run build
   ```