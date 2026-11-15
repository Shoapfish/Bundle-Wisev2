BUNDLE WISE - READY-TO-RUN FOLDER
=================================

What is in this folder
  index.html      the whole app (customer and admin pages)
  config.js       your Firebase values  <-- the ONLY file you must edit
  cloud.js        talks to Firebase (no need to touch)
  sw.js           makes the app work as an installable app
  manifest.json   app name and icons
  images/         plain placeholder icons (replace when you send the logo)
  firestore.rules the database rules to paste into Firebase
  run-local.bat   double-click to try it on your computer

STEP 1 - Firebase (one time, about 10 minutes)
  1. console.firebase.google.com > open your project.
  2. Project settings > Your apps > copy apiKey, authDomain, projectId, appId
     into config.js (replace the PASTE_ words, keep the quotes).
  3. Build > Authentication > Email/Password must be ON.
  4. Build > Firestore Database > Rules: delete everything, paste the whole
     of firestore.rules, click Publish.
  5. Make yourself admin: Authentication > Users > Add user (your email and
     password) and copy its User UID. Then Firestore Database > Data >
     Start collection named  admins , Document ID = your User UID,
     add any field (for example role = admin).

STEP 2 - Try it on your computer
  Double-click run-local.bat (needs Python). Your browser opens
  http://localhost:8000 . Log in on the Admin tab, go to Products and click
  "Load sample items". Then register a customer and place a test order.

STEP 3 - Put it online (your existing GitHub repo)
  1. Copy everything in this folder into  c:\codes\bundlewise  and
     overwrite the old files.
  2. Delete admin.html and the old logo .jfif from that project folder
     (they are not used any more).
  3. In the terminal:
       git add -A
       git commit -m "New Bundle Wise"
       git push
  4. Wait for Render to say Live, then open your site.

Plain logo: when you send the new logo, it replaces the text "Bundle Wise"
in the header and the icons in the images folder.


NEW FEATURES (added later)
=========================
IMPORTANT: paste the new firestore.rules into Firebase again (Firestore Database >
Rules > delete everything > paste > Publish). Cancel order and Chat will NOT work
until you do this.

1. Cancel order (customer)
   My Orders > a Pending order has a "Cancel order" button. The customer picks a
   reason. Once the admin starts Preparing the order, it can no longer be cancelled
   by the customer (they are pointed to the chat instead). The admin sees
   "Cancelled by the customer" and the reason on the order.

2. Customer service chat
   Customers get a round chat button (bottom-right). The admin gets a new
   "Chat" page: conversations on the left, messages on the right, with a red
   number for unread messages. Messages arrive live, no refresh needed.

3. Reports and Analytics (admin only, new "Analytics" menu)
   Total Customers, Total Sales, Best-Selling Bundle, Monthly Revenue Monitoring
   with trend graph, Top Performing Bundles (rank 1-10), Recent Daily Performance
   and Key Insights. Cancelled orders are not counted. Change the date range at
   the top right.
   Note: customer growth uses the sign-up date. Accounts created before this
   update have no sign-up date, so they count as "existing" customers.

4. Delete a conversation
   Both the customer (trash icon in the chat window) and the admin (Delete
   conversation button in the Chat page) can delete a whole conversation. It is
   removed for both sides. Re-publish firestore.rules for this to work.
