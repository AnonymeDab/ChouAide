// Importation des modules nécessaires
const express = require("express"); // Framework web principal
const session = require("express-session"); // Gestion des sessions utilisateur
const dotenv = require("dotenv"); // Chargement des variables d'environnement
const path = require("path"); // Gestion des chemins de fichiers
const mongoose = require('mongoose'); // ODM pour MongoDB
const User = require('./models/User'); // Modèle utilisateur
const Proposition = require('./models/Proposition'); // Modèle proposition de service
const bcrypt = require('bcrypt'); // Pour le hash des mots de passe

dotenv.config(); // Charge les variables d'environnement depuis .env

const app = express(); // Crée l'application Express
const PORT = process.env.PORT || 3000; // Définit le port d'écoute

// Middleware pour parser les données des formulaires
app.use(express.urlencoded({ extended: true }));

// Sert les fichiers statiques (CSS, images, JS) depuis le dossier public
app.use(express.static(path.join(__dirname, "public")));

// Définit EJS comme moteur de templates
app.set("view engine", "ejs");
// Définit le dossier des vues
app.set("views", path.join(__dirname, "views"));

// Configuration de la session utilisateur
app.use(session({
  secret: process.env.SESSION_SECRET, // Clé secrète pour signer la session
  resave: false, // Ne pas sauvegarder la session si rien n'a changé
  saveUninitialized: true // Sauvegarder une session même si elle est vide
}));

// Middleware pour rendre l'utilisateur courant accessible dans toutes les vues
app.use(async (req, res, next) => {
  if (req.session.userId) {
    const user = await User.findById(req.session.userId).select('username isAdmin');
    res.locals.user = user; // Accessible dans toutes les vues EJS
  } else {
    res.locals.user = null;
  }
  next();
});

// Route page d'accueil
app.get("/", (req, res) => {
  res.render("index");
});

// Route politique de confidentialité
app.get('/politique-confidentialite', (req, res) => {
  res.render('politique-confidentialite');
});

// Route mentions légales
app.get('/mentions-legales', (req, res) => {
  res.render('mentions-legales');
});

// Route à propos
app.get("/about", (req, res) => {
  res.render("Apropos");
});

// Route contact
app.get("/contact", (req, res) => {
  res.render("contact");
});

// Route pour proposer un service (formulaire)
app.get("/proposer", (req, res) => {
  res.render("proposer");
});

// Route pour afficher les profils/prestations (avec filtre catégorie possible)
app.get('/profils', async (req, res) => {
  let filter = {};
  if (req.query.categorie) {
    filter.categorie = req.query.categorie; // Filtre par catégorie si précisé
  }
  const propositions = await Proposition.find(filter).sort({ date: -1 });
  res.render('profils', { propositions, selectedCategorie: req.query.categorie || null });
});

// Route admin protégée (liste des utilisateurs)
app.get("/admin", requireAdmin, async (req, res) => {
  const users = await User.find().select('username email isAdmin');
  res.render("admin", { users });
});

// Route inscription (GET)
app.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/"); // Redirige si déjà connecté
  }
  res.render("register");
});

// Route connexion (GET)
app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/"); // Redirige si déjà connecté
  }
  res.render("login");
});

// Page de remerciement (exemple)
app.get("/merci", (req, res) => {
  res.render("merci");
});

// Route pour trouver des prestations (affiche toutes les propositions)
app.get("/trouver", async (req, res) => {
  const propositions = await Proposition.find().sort({ date: -1 });
  res.render('trouver', { propositions });
});

// Route pour afficher un profil utilisateur spécifique (par ID)
app.get("/profil/:id", (req, res) => {
  const userId = req.params.id;
  if (!userId) {
    return res.status(400).send("ID utilisateur manquant");
  }
  res.render("profil", { userId });
});

// ======================
// ROUTES POST (formulaires)
// ======================

// Inscription utilisateur (POST)
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.render("register", { errors: [{ msg: "Tous les champs sont requis" }] });
  }
  try {
    // Vérifie si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("register", { errors: [{ msg: "Cet email est déjà utilisé." }] });
    }
    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    // Crée et sauvegarde l'utilisateur
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    req.session.userId = newUser._id; // Connecte l'utilisateur
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("register", { errors: [{ msg: "Erreur lors de l'inscription" }] });
  }
});

// Connexion utilisateur (POST)
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render("login", { errors: [{ msg: "Tous les champs sont requis" }] });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { errors: [{ msg: "Utilisateur non trouvé" }] });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { errors: [{ msg: "Mot de passe incorrect" }] });
    }
    req.session.userId = user._id; // Connecte l'utilisateur
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("login", { errors: [{ msg: "Erreur lors de la connexion" }] });
  }
});

// Déconnexion utilisateur
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// ======================
// MIDDLEWARE ADMIN
// ======================

// Fonction middleware pour vérifier si l'utilisateur est admin
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  User.findById(req.session.userId).then(user => {
    if (user && user.isAdmin) {
      next(); // Passe à la suite si admin
    } else {
      res.status(403).send("Accès réservé aux administrateurs.");
    }
  }).catch(() => res.redirect('/login'));
}

// ======================
// ROUTES ADMIN
// ======================

// Page admin (liste des utilisateurs)
app.get("/admin", requireAdmin, async (req, res) => {
  const users = await User.find().select('username email isAdmin');
  res.render("admin", { users });
});

// Rendre un utilisateur admin
app.get('/admin/promote/:id', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isAdmin: true });
  res.redirect('/admin');
});

// Retirer le statut admin à un utilisateur
app.get('/admin/demote/:id', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isAdmin: false });
  res.redirect('/admin');
});

// Supprimer un utilisateur
app.get('/admin/delete/:id', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// ======================
// PROPOSITIONS DE SERVICES
// ======================

// Enregistrer une nouvelle proposition de service (POST)
app.post('/proposer', async (req, res) => {
  try {
    const { nom, competence, dispo, niveau, email, titre, contact, description, categorie } = req.body;
    await Proposition.create({ nom, competence, dispo, niveau, email, titre, contact, description, categorie });
    res.render('proposer', { success: "Service proposé avec succès !" });
  } catch (err) {
    console.error(err);
    res.render('proposer', { errors: [{ msg: "Erreur lors de l'envoi" }] });
  }
});

// Afficher les propositions filtrées par catégorie (URL param)
app.get("/profils/categorie/:categorie", async (req, res) => {
  const propositions = await Proposition.find({ categorie: req.params.categorie }).sort({ date: -1 });
  res.render("profils", { propositions, selectedCategorie: req.params.categorie });
});

// ======================
// CONNEXION À LA BASE DE DONNÉES
// ======================

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chouaide', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connecté à MongoDB');
}).catch(err => {
  console.error('Erreur MongoDB :', err);
});

// ======================
// GESTION DES ERREURS GLOBALES
// ======================

// Gestion des erreurs serveur (500, etc.)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: err.message });
});

// Gestion des erreurs 404 (page non trouvée)
app.use((req, res) => {
  res.status(404).render('error', { message: "Page introuvable" });
});

// ======================
// DÉMARRAGE DU SERVEUR
// ======================

app.listen(PORT, () => {
  console.log(`✅ ChouAide fonctionne sur http://localhost:${PORT}`);
});
