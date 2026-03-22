const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWuQlEQqm8GKVKncE2cnqo3SaDdxJ3MFo",
  authDomain: "xoxinfinity-96dce.firebaseapp.com",
  projectId: "xoxinfinity-96dce",
  storageBucket: "xoxinfinity-96dce.firebasestorage.app",
  messagingSenderId: "274803484143",
  appId: "1:274803484143:web:927891ef9abeb051c1021a",
  // Google Client ID buraya geri geldi:
  googleClientId: "274803484143-8vr4gfje3volompe4jg43gbaglh4r7i4.apps.googleusercontent.com"
};

// Firebase Başlatma
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Google Sağlayıcı Ayarı
const googleProvider = new firebase.auth.GoogleAuthProvider();
// Eğer login fonksiyonunda googleClientId kullanıyorsan bu değişkeni orada kullanabilirsin.