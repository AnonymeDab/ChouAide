# Cours Complet : Gestion des Utilisateurs et des Rôles

## Table des matières
1. [Concepts fondamentaux](#concepts-fondamentaux)
2. [Architectures et patterns](#architectures-et-patterns)
3. [Implémentation générique (code réutilisable)](#implémentation-générique)
4. [Implémentation ChouAide (analyse du projet)](#implémentation-chouaide)
5. [Améliorations et bonnes pratiques](#améliorations-et-bonnes-pratiques)

---

## Concepts fondamentaux

### Qu'est-ce qu'un utilisateur ?
Un utilisateur est une entité qui interagit avec votre application. Elle a une **identité** (username, email) et des **permissions** (ce qu'elle peut faire).

### Qu'est-ce qu'un rôle ?
Un rôle est un ensemble de **permissions** attribuées à un utilisateur. Les rôles courants sont :

| Rôle | Description | Permissions |
|------|-------------|-------------|
| **Guest** (Visiteur) | Utilisateur non authentifié | Voir le contenu public |
| **User** (Utilisateur simple) | Utilisateur enregistré | Voir profils, proposer service, contacter |
| **Admin** | Gestionnaire du site | Supprimer users, modifier propositions, voir stats |
| **Super-Admin** | Administrateur suprême | Tout contrôler, dont la gestion d'autres admins |
| **Moderator** | Modérateur de contenu | Approuver/refuser propositions, signaler contenus |

### Authentification vs Autorisation
- **Authentification** = Vérifier qui vous êtes (login/password).
- **Autorisation** = Vérifier ce que vous avez le droit de faire (basé sur rôles).

### Session vs Token
- **Session** = Données serveur stockées en mémoire / Redis / BD, identifiées par un cookie client.
- **JWT Token** = Données chiffrées envoyées au client, le client les renvoie à chaque requête.

ChouAide utilise des **sessions** (express-session).

---

## Architectures et patterns

### 1. Architecture simple (booléens)
```javascript
// Modèle utilisateur
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String,
  isAdmin: Boolean,  // true = admin, false = user simple
}
```

**Avantages** : Facile, rapide.  
**Inconvénients** : Limite à 2 rôles (admin/non-admin), pas de granularité.

### 2. Architecture avec tableau de rôles
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String,
  roles: ['user', 'admin', 'moderator'],  // Tableau de rôles
  permissions: ['delete_user', 'edit_post'],  // Permissions explicites
}
```

**Avantages** : Flexible, support multi-rôles.  
**Inconvénients** : Plus complexe à requêter.

### 3. Architecture avec hiérarchie de rôles
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String,
  role: 'super-admin',  // Un seul rôle principal
  level: 3,  // 0=guest, 1=user, 2=admin, 3=super-admin
}
```

**Avantages** : Hiérarchie claire, easy permission checks (`level >= 2`).  
**Inconvénients** : Moins flexible pour rôles non-hiérarchiques (moderator ≠ admin).

### 4. Architecture RBAC (Role-Based Access Control) avancée
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String,
  roles: [
    {
      roleId: ObjectId,
      name: 'admin',
      permissions: ['delete_user', 'edit_post', 'view_analytics'],
      scope: 'global'  // ou 'department', 'region', etc.
    }
  ],
  metadata: {
    lastLogin: Date,
    loginCount: Number,
    isActive: Boolean,
    deactivatedAt: Date,
  }
}
```

**Avantages** : Très flexible, support scopes, audit trail possible.  
**Inconvénients** : Complexe, nécessite une BD bien conçue.

---

## Implémentation générique

### Modèle 1 : Simple (User + Admin)
```javascript
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Hacher le password avant de sauvegarder
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

// Méthode pour comparer password
userSchema.methods.comparePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

// Méthode pour vérifier si admin
userSchema.methods.isAdminUser = function() {
  return this.isAdmin === true;
};

module.exports = mongoose.model('User', userSchema);
```

### Modèle 2 : Avec tableau de rôles
```javascript
// models/User.js
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roles: {
    type: [String],
    enum: ['user', 'admin', 'moderator', 'super-admin'],
    default: ['user']
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Méthodes d'accès
userSchema.methods.hasRole = function(role) {
  return this.roles.includes(role);
};

userSchema.methods.hasAnyRole = function(...roles) {
  return roles.some(role => this.roles.includes(role));
};

userSchema.methods.hasAllRoles = function(...roles) {
  return roles.every(role => this.roles.includes(role));
};

userSchema.methods.addRole = function(role) {
  if (!this.roles.includes(role)) {
    this.roles.push(role);
  }
  return this;
};

userSchema.methods.removeRole = function(role) {
  this.roles = this.roles.filter(r => r !== role);
  return this;
};

module.exports = mongoose.model('User', userSchema);
```

### Modèle 3 : Avec hiérarchie
```javascript
// models/User.js
const ROLE_LEVELS = {
  'guest': 0,
  'user': 1,
  'moderator': 1.5,
  'admin': 2,
  'super-admin': 3
};

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: Object.keys(ROLE_LEVELS),
    default: 'user'
  },
  level: {
    type: Number,
    default: 1
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Hooks pour mettre à jour le level lors du changement de rôle
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    this.level = ROLE_LEVELS[this.role] || 0;
  }
  next();
});

// Méthodes d'accès
userSchema.methods.hasPermission = function(requiredLevel) {
  return this.level >= requiredLevel;
};

userSchema.methods.isAtLeast = function(role) {
  return this.level >= ROLE_LEVELS[role];
};

userSchema.methods.canDeleteUser = function(targetUser) {
  // Un super-admin peut supprimer quiconque
  if (this.role === 'super-admin') return true;
  // Un admin peut supprimer les users, pas les autres admins
  if (this.role === 'admin' && targetUser.role === 'user') return true;
  return false;
};

module.exports = mongoose.model('User', userSchema);
```

### Middleware d'authentification (générique)
```javascript
// middleware/auth.js

// Middleware : vérifier que l'utilisateur est connecté
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// Middleware : vérifier un rôle
function requireRole(role) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }
    
    // Adapter selon l'architecture
    if (typeof user.hasRole === 'function') {
      if (!user.hasRole(role)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    } else if (user.role === role) {
      // Architecture simple
    } else {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    req.user = user; // Ajouter l'utilisateur à la requête
    next();
  };
}

// Middleware : vérifier plusieurs rôles
function requireAnyRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }
    
    const hasPermission = roles.some(role => {
      if (typeof user.hasRole === 'function') {
        return user.hasRole(role);
      }
      return user.role === role;
    });
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    req.user = user;
    next();
  };
}

// Middleware : vérifier permission au niveau hiérarchique
function requireLevel(minLevel) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user || !user.hasPermission || !user.hasPermission(minLevel)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    req.user = user;
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAnyRole,
  requireLevel
};
```

### Routes protégées (exemples)
```javascript
// routes/admin.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

// Route admin : liste des utilisateurs (uniquement admins)
router.get('/users', requireRole('admin'), async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

// Route admin : promouvoir un utilisateur en admin
router.post('/users/:id/promote', requireRole('super-admin'), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isAdmin: true }, { new: true });
  res.json({ success: true, user });
});

// Route admin : supprimer un utilisateur
router.delete('/users/:id', requireRole('super-admin'), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Route protégée : voir le profil de l'utilisateur connecté
router.get('/profile', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).select('-password');
  res.json(user);
});

module.exports = router;
```

### Exemple complet : Inscription et Connexion
```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');

// Inscription
router.post('/register', async (req, res) => {
  const { username, email, password, passwordConfirm } = req.body;
  
  // Validations
  if (!username || !email || !password || !passwordConfirm) {
    return res.render('register', { message: 'Tous les champs sont requis' });
  }
  
  if (password !== passwordConfirm) {
    return res.render('register', { message: 'Les mots de passe ne correspondent pas' });
  }
  
  if (password.length < 8) {
    return res.render('register', { message: 'Le mot de passe doit faire au moins 8 caractères' });
  }
  
  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.render('register', { message: 'Cet email est déjà utilisé' });
    }
    
    // Créer l'utilisateur
    const newUser = new User({
      username,
      email,
      password, // Le hachage se fait en pre('save')
      roles: ['user'] // ou isAdmin: false pour architecture simple
    });
    
    await newUser.save();
    
    // Connecter automatiquement l'utilisateur
    req.session.userId = newUser._id;
    res.status(201).redirect('/');
  } catch (err) {
    console.error(err);
    res.render('register', { message: 'Erreur lors de l\'inscription' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.render('login', { message: 'Email et mot de passe requis' });
  }
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('login', { message: 'Identifiants incorrects' });
    }
    
    // Vérifier le password
    const isPasswordValid = user.comparePassword ? 
      await user.comparePassword(password) :
      await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.render('login', { message: 'Identifiants incorrects' });
    }
    
    // Connecter l'utilisateur
    req.session.userId = user._id;
    
    // Optionnel : rediriger vers la page admin si admin
    if (user.isAdmin || user.roles?.includes('admin')) {
      return res.redirect('/admin');
    }
    
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { message: 'Erreur lors de la connexion' });
  }
});

// Déconnexion
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
```

---

## Implémentation ChouAide

### État actuel du projet
Le projet utilise une **architecture simple** avec un booléen `isAdmin` :

```javascript
// models/User.js
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin:  { type: Boolean, default: false }  // <-- Simple !
});
```

### Flux de gestion des admins (analyse du code app.js)

#### 1. Inscription (aucune distinction admin)
```javascript
// app.js - POST /register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  // ... validations ...
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashedPassword });
  await newUser.save();
  // L'utilisateur est créé avec isAdmin = false (défaut)
  req.session.userId = newUser._id;
  res.redirect("/");
});
```

#### 2. Connexion (pareil pour tous)
```javascript
// app.js - POST /login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.render("login", { errors: [{ msg: "Mot de passe incorrect" }] });
  }
  req.session.userId = user._id; // Stocke juste l'ID en session
  res.redirect("/");
});
```

#### 3. Middleware pour vérifier si admin
```javascript
// app.js
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  User.findById(req.session.userId).then(user => {
    if (user && user.isAdmin) {
      next(); // Passe si admin
    } else {
      res.status(403).send("Accès réservé aux administrateurs.");
    }
  }).catch(() => res.redirect('/login'));
}
```

#### 4. Routes admin (protégées)
```javascript
// app.js - GET /admin
app.get("/admin", requireAdmin, async (req, res) => {
  const users = await User.find().select('username email isAdmin');
  res.render("admin", { users });
});

// GET /admin/promote/:id
app.get('/admin/promote/:id', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isAdmin: true });
  res.redirect('/admin');
});

// GET /admin/demote/:id
app.get('/admin/demote/:id', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isAdmin: false });
  res.redirect('/admin');
});

// GET /admin/delete/:id
app.get('/admin/delete/:id', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});
```

### Limitations de l'implémentation actuelle

| Aspect | Limitation | Impact |
|--------|-----------|--------|
| **Rôles** | Seulement 2 niveaux (admin / user) | Pas de moderator, super-admin, etc. |
| **Permissions** | Pas de permissions granulaires | Un admin peut tout faire |
| **Hiérarchie** | Aucune hiérarchie | Un admin ne peut pas créer un autre admin sans direct DB access |
| **Audit** | Pas de logs | Impossible de tracer qui a supprimé qui |
| **Scopes** | Global seulement | Pas d'admin par région/catégorie |
| **Sécurité** | Routes admin en GET | Les GET doivent être idempotent, DELETE doit être POST/DELETE HTTP |
| **Méthodes** | Pas de méthodes sur le modèle | Code dispersé dans les routes |
| **Validation** | Minimale | Peu de vérifications côté serveur |
| **Session** | Pas d'expiration | Sessions infinies (sauf si configuré en express-session) |

### Exemple de schéma amélioré pour ChouAide
```javascript
// models/User.js (amélioré)
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    match: /.+\@.+\..+/
  },
  password: { 
    type: String, 
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin', 'super-admin'],
    default: 'user'
  },
  // Permissions spécifiques (optionnel)
  permissions: [String], // ex: ['delete_proposition', 'edit_user']
  
  // Informations additionnelles
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    photo: String,
    bio: String
  },
  
  // Audit
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date,
  
  // ChouAide spécifique
  propositions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposition'
  }],
  
  isBanned: { type: Boolean, default: false },
  banReason: String,
  banDate: Date
});

// Hacher le password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    this.updatedAt = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

// Méthodes d'accès
userSchema.methods.comparePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

userSchema.methods.hasRole = function(role) {
  const roleLevel = { 'user': 1, 'moderator': 2, 'admin': 3, 'super-admin': 4 };
  return roleLevel[this.role] >= roleLevel[role];
};

userSchema.methods.hasPermission = function(permission) {
  if (this.role === 'super-admin') return true;
  if (this.role === 'admin') return true;
  return this.permissions.includes(permission);
};

userSchema.methods.canDeleteUser = function(targetUser) {
  if (this.role === 'super-admin') return true;
  if (this.role === 'admin' && targetUser.role === 'user') return true;
  return false;
};

userSchema.methods.ban = function(reason = 'Violation des conditions d\'utilisation') {
  this.isBanned = true;
  this.banReason = reason;
  this.banDate = new Date();
  return this;
};

userSchema.methods.unban = function() {
  this.isBanned = false;
  this.banReason = null;
  this.banDate = null;
  return this;
};

module.exports = mongoose.model('User', userSchema);
```

---

## Améliorations et bonnes pratiques

### 1. Sécurité
- ✅ Toujours hacher les passwords (bcrypt, argon2).
- ✅ Utiliser des sessions sécurisées (secure, httpOnly, sameSite).
- ✅ Valider/sanitiser les entrées.
- ✅ Utiliser HTTPS en production.
- ✅ Ajouter CSRF tokens.
- ✅ Rate limiting sur login/register.
- ✅ Logs d'audit pour actions sensibles.

### 2. Architecture
- ✅ Séparer authentification et autorisation.
- ✅ Utiliser des middleware réutilisables.
- ✅ Stocker les permissions/rôles en BD.
- ✅ Cacher les details de l'utilisateur (`select('-password')`).

### 3. Performance
- ✅ Indexer les champs unique/recherchés (email, username).
- ✅ Cacher les requêtes de rôle (Redis).
- ✅ Paginer les listes d'utilisateurs.

### 4. UX
- ✅ Messages d'erreur clairs.
- ✅ Redirect approprié après login.
- ✅ Session timeout avec notification.
- ✅ 2FA (Two-Factor Authentication) pour admins.

### 5. Tests
```javascript
// test/auth.test.js (avec Jest)
describe('Authentication', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        passwordConfirm: 'password123'
      });
    expect(res.status).toBe(201);
  });
  
  it('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    expect(res.status).toBe(200);
    expect(res.req.session.userId).toBeDefined();
  });
  
  it('should deny access without permission', async () => {
    const res = await request(app)
      .get('/admin')
      .set('Cookie', 'sessionId=user_session'); // User simple
    expect(res.status).toBe(403);
  });
});
```

---

## Résumé

| Concept | Simple | Avec rôles | Avec hiérarchie | RBAC avancé |
|---------|--------|-----------|-----------------|------------|
| **Modèle** | `isAdmin` | `roles: []` | `role + level` | Permissions granulaires |
| **Flexibilité** | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Complexité** | Facile | Moyen | Moyen | Complexe |
| **Cas d'usage** | MVP, petit projet | Plateforme multi-rôles | SaaS, hiérarchie claire | Enterprise |
| **ChouAide** | ✅ (Actuel) | ✅ (Recommandé) | Optionnel | Pour plus tard |

---

## Fichiers clés pour ChouAide
- `models/User.js` → Schema utilisateur
- `models/Proposition.js` → Schema propositions
- `app.js` → Routes et middleware
- `middleware/auth.js` → Middleware d'auth (à créer)
- `routes/admin.js` → Routes admin (à améliorer)
- `views/admin.ejs` → Interface admin
- `views/login.ejs`, `views/register.ejs` → Formulaires
