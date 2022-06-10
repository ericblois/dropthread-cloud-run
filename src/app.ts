import { functions } from './Functions'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import express from 'express';
const app = express();
import { json } from 'body-parser';
app.use(json());

// Initialize Firebase
initializeApp({
  credential: applicationDefault()
})
const auth = getAuth();
// Verify JWT token and return user ID
const verifyUser = async (token?: string) => {
  if (token) {
    const decoded = await auth.verifyIdToken(token)
    return decoded.uid
  }
  throw new Error('Invalid token, unauthorized');
}
// App will only get POST requests
/* app.get('/*', async (req, res, next) => {
  try {
    const url = req.url.substring(1)
    if (functions.GET[url]) {
      const result = await functions.GET[url](req.body)
      res.status(200).json(result)
    } else {
      res.status(404)
    }
  } catch (e) {
    res.status(500).json({
      error: e
    })
  }
}); */

app.post('/*', async (req, res, next) => {
  try {
    req.body.userID = await verifyUser(req.body.JWTToken)
    const url = req.url.substring(1)
    if (functions.POST[url]) {
      const result = await functions.POST[url](req.body)
      res.status(200).json(result)
    } else {
      res.status(404)
    }
  } catch (e) {
    res.status(500).json({
      error: e
    })
  }
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`helloworld: listening on port ${port}`);
});