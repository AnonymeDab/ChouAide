# Guide d'amélioration : Gestion des utilisateurs ChouAide

Ce guide montre comment améliorer le système actuel de ChouAide step-by-step.

---

## État actuel (Recap)

**Modèle User** : Seulement `isAdmin` (Boolean).
**Middleware** : `requireAdmin()` en ligne dans app.js.
**Routes admin** : GET pour modifier (mauvaise pratique, devrait être POST/DELETE).
**Sécurité** : Minimale, peu de validation.

---

## Étape 1 : Créer un middleware d'auth réutilisable

**Créer le fichier** : `middleware/auth.js`

```javascript
// middleware/auth.js
const User = require('../models/User');

/**
 * Vérifie que l'utilisateur est authentifié
 */
async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).render('error', { message: 'Vous devez être connecté' });
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).render('error', { message: 'Utilisateur introuvable' });
    }
    req.user = user; // Ajouter l'user au contexte de la requête
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).render('error', { message: 'Erreur d\'authentification' });
  }
}

/**
 * Vérifie que l'utilisateur est admin
 */
async function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).render('error', { message: 'Vous devez être connecté' });
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).render('error', { message: 'Accès réservé aux administrateurs' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).render('error', { message: 'Erreur de vérification' });
  }
}

/**
 * Vérifie que l'utilisateur est super-admin (pour promotion d'autres admins)
 */
async function requireSuperAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).render('error', { message: 'Vous devez être connecté' });
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.isSuperAdmin) {
      return res.status(403).render('error', { message: 'Accès réservé aux super-administrateurs' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('SuperAdmin check error:', err);
    res.status(500).render('error', { message: 'Erreur de vérification' });
  }
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSuperAdmin
};
```

---

## Étape 2 : Améliorer le modèle User

**Modifier** : `models/User.js`

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
    minlength: 3,
    maxlength: 30
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 8
  },
  isAdmin: { 
    type: Boolean, 
    default: false 
  },
  isSuperAdmin: { 
    type: Boolean, 
    default: false 
  },
  
  // Profil utilisateur
  profile: {
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    phone: { type: String, default: null },
    photo: { type: String, default: null },
    bio: { type: String, default: null }
  },
  
  // Audit et sécurité
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: null },
  banDate: { type: Date, default: null },
  
  // Métadonnées
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null },
  loginCount: { type: Number, default: 0 },
  
  // Relations
  propositions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposition'
  }]
}, { timestamps: true });

// ============ HOOKS ============

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

// Supprimer les passwords des résultats
userSchema.post(/^find/, function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      if (doc.password) doc.password = undefined;
    });
  } else if (docs && docs.password) {
    docs.password = undefined;
  }
});

// ============ MÉTHODES ============

/**
 * Comparer un password en clair avec le hash
 */
userSchema.methods.comparePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

/**
 * Vérifier si l'utilisateur est admin (ou super-admin)
 */
userSchema.methods.isAdminUser = function() {
  return this.isAdmin === true || this.isSuperAdmin === true;
};

/**
 * Vérifier si l'utilisateur peut promouvoir un autre utilisateur
 */
userSchema.methods.canPromoteUser = function(targetUser) {
  if (this.isSuperAdmin) return true;
  if (this.isAdmin && !targetUser.isAdmin) return true;
  return false;
};

/**
 * Vérifier si l'utilisateur peut supprimer un autre utilisateur
 */
userSchema.methods.canDeleteUser = function(targetUser) {
  // Vous ne pouvez pas vous supprimer vous-même
  if (this._id.toString() === targetUser._id.toString()) return false;
  // Super-admin peut supprimer n'importe qui
  if (this.isSuperAdmin) return true;
  // Admin peut supprimer des users simples seulement
  if (this.isAdmin && !targetUser.isAdmin) return true;
  return false;
};

/**
 * Bannir un utilisateur
 */
userSchema.methods.ban = function(reason = 'Violation des conditions d\'utilisation') {
  this.isBanned = true;
  this.banReason = reason;
  this.banDate = new Date();
  return this;
};

/**
 * Débannir un utilisateur
 */
userSchema.methods.unban = function() {
  this.isBanned = false;
  this.banReason = null;
  this.banDate = null;
  return this;
};

/**
 * Mettre à jour lastLogin
 */
userSchema.methods.recordLogin = function() {
  this.lastLogin = new Date();
  this.loginCount = (this.loginCount || 0) + 1;
  return this;
};

/**
 * Obtenir l'affichage public de l'utilisateur
 */
userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    username: this.username,
    profile: this.profile,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
```

---

## Étape 3 : Créer un contrôleur d'administration

**Créer le fichier** : `controllers/authController.js`

```javascript
// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcrypt');

/**
 * Enregistrer un nouvel utilisateur
 */
exports.register = async (req, res) => {
  try {
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
    
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.render('register', { 
        message: 'Cet email ou ce nom d\'utilisateur est déjà utilisé' 
      });
    }
    
    // Créer l'utilisateur
    const newUser = new User({
      username,
      email,
      password
    });
    
    await newUser.save();
    
    // Connecter automatiquement
    req.session.userId = newUser._id;
    res.status(201).redirect('/');
    
  } catch (err) {
    console.error('Register error:', err);
    res.render('register', { message: 'Erreur lors de l\'inscription' });
  }
};

/**
 * Connecter un utilisateur
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.render('login', { message: 'Email et mot de passe requis' });
    }
    
    const user = await User.findOne({ email });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.render('login', { message: 'Email ou mot de passe incorrect' });
    }
    
    if (user.isBanned) {
      return res.render('login', { 
        message: `Votre compte a été banni. Raison : ${user.banReason}` 
      });
    }
    
    // Enregistrer la connexion
    user.recordLogin();
    await user.save();
    
    // Créer la session
    req.session.userId = user._id;
    
    // Rediriger selon le rôle
    if (user.isSuperAdmin || user.isAdmin) {
      return res.redirect('/admin');
    }
    
    res.redirect('/');
    
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { message: 'Erreur lors de la connexion' });
  }
};

/**
 * Déconnecter un utilisateur
 */
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};
```

**Créer le fichier** : `controllers/adminController.js`

```javascript
// controllers/adminController.js
const User = require('../models/User');
const Proposition = require('../models/Proposition');

/**
 * Afficher le tableau de bord admin
 */
exports.getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ isAdmin: true });
    const totalPropositions = await Proposition.countDocuments();
    const bannedUsers = await User.countDocuments({ isBanned: true });
    
    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.render('admin', {
      stats: {
        totalUsers,
        totalAdmins,
        totalPropositions,
        bannedUsers
      },
      recentUsers
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('error', { message: 'Erreur lors du chargement du tableau de bord' });
  }
};

/**
 * Lister tous les utilisateurs
 */
exports.listUsers = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const users = await User.find()
      .select('-password')
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);
    
    res.render('users', {
      users,
      currentPage: page,
      totalPages,
      totalUsers
    });
  } catch (err) {
    console.error('List users error:', err);
    res.render('error', { message: 'Erreur lors de la récupération des utilisateurs' });
  }
};

/**
 * Promouvoir un utilisateur en admin
 */
exports.promoteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    // Vérifier que l'utilisateur qui promeut a les permissions
    if (!req.user.canPromoteUser(targetUser)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'avez pas la permission de promouvoir cet utilisateur' 
      });
    }
    
    targetUser.isAdmin = true;
    await targetUser.save();
    
    res.json({ success: true, message: 'Utilisateur promu en admin' });
  } catch (err) {
    console.error('Promote error:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la promotion' });
  }
};

/**
 * Rétrograder un admin en utilisateur simple
 */
exports.demoteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    // Empêcher un admin de se rétrograder lui-même
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vous ne pouvez pas vous rétrograder vous-même' 
      });
    }
    
    targetUser.isAdmin = false;
    await targetUser.save();
    
    res.json({ success: true, message: 'Utilisateur rétrogradé' });
  } catch (err) {
    console.error('Demote error:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la rétrogradation' });
  }
};

/**
 * Supprimer un utilisateur
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    // Vérifier les permissions
    if (!req.user.canDeleteUser(targetUser)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'avez pas la permission de supprimer cet utilisateur' 
      });
    }
    
    await User.findByIdAndDelete(userId);
    
    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
};

/**
 * Bannir un utilisateur
 */
exports.banUser = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    targetUser.ban(reason || 'Aucune raison spécifiée');
    await targetUser.save();
    
    res.json({ success: true, message: 'Utilisateur banni' });
  } catch (err) {
    console.error('Ban user error:', err);
    res.status(500).json({ success: false, message: 'Erreur lors du bannissement' });
  }
};

/**
 * Débannir un utilisateur
 */
exports.unbanUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    
    targetUser.unban();
    await targetUser.save();
    
    res.json({ success: true, message: 'Utilisateur débanni' });
  } catch (err) {
    console.error('Unban user error:', err);
    res.status(500).json({ success: false, message: 'Erreur lors du débannissement' });
  }
};
```

---

## Étape 4 : Créer des routes propres

**Créer le fichier** : `routes/authRoutes.js`

```javascript
// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

module.exports = router;
```

**Créer le fichier** : `routes/adminRoutes.js`

```javascript
// routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes admin requièrent l'authentification et le rôle admin
router.use(requireAdmin);

// Tableau de bord admin
router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);

// Opérations sur les utilisateurs (requièrent super-admin pour promotion)
router.post('/users/promote', requireSuperAdmin, adminController.promoteUser);
router.post('/users/demote', requireSuperAdmin, adminController.demoteUser);
router.delete('/users/:id', requireSuperAdmin, adminController.deleteUser);

// Bannissement (admin suffisant)
router.post('/users/ban', adminController.banUser);
router.post('/users/unban', requireSuperAdmin, adminController.unbanUser);

module.exports = router;
```

---

## Étape 5 : Intégrer dans app.js

**Modifier app.js** (ajouter avant les routes) :

```javascript
// app.js (à ajouter après les imports)
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

// ... configuration express, middleware, sessions ...

// Routes publiques
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/about", (req, res) => {
  res.render("Apropos");
});

// Routes d'authentification
app.use('/auth', authRoutes);
app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render('register');
});
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render('login');
});

// Routes admin
app.use('/admin', adminRoutes);

// Reste des routes (propositions, etc.)
// ...
```

---

## Étape 6 : Exemple d'utilisation en EJS (admin.ejs)

```ejs
<!-- views/admin.ejs -->
<div class="admin-container">
  <h1>Tableau de bord Admin</h1>
  
  <% if (locals.stats) { %>
    <div class="stats">
      <div class="stat">
        <h3><%= stats.totalUsers %></h3>
        <p>Utilisateurs</p>
      </div>
      <div class="stat">
        <h3><%= stats.totalAdmins %></h3>
        <p>Administrateurs</p>
      </div>
      <div class="stat">
        <h3><%= stats.totalPropositions %></h3>
        <p>Propositions</p>
      </div>
      <div class="stat">
        <h3><%= stats.bannedUsers %></h3>
        <p>Utilisateurs bannis</p>
      </div>
    </div>
  <% } %>
  
  <h2>Utilisateurs récents</h2>
  <table class="users-table">
    <thead>
      <tr>
        <th>Nom d'utilisateur</th>
        <th>Email</th>
        <th>Rôle</th>
        <th>Inscrit le</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <% recentUsers.forEach(user => { %>
        <tr>
          <td><%= user.username %></td>
          <td><%= user.email %></td>
          <td>
            <% if (user.isSuperAdmin) { %>
              <span class="badge admin">Super-Admin</span>
            <% } else if (user.isAdmin) { %>
              <span class="badge admin">Admin</span>
            <% } else { %>
              <span class="badge user">User</span>
            <% } %>
          </td>
          <td><%= new Date(user.createdAt).toLocaleDateString('fr-FR') %></td>
          <td>
            <% if (!user.isSuperAdmin) { %>
              <% if (!user.isAdmin) { %>
                <button class="btn btn-sm btn-promote" data-id="<%= user._id %>">
                  Promouvoir
                </button>
              <% } %>
              <button class="btn btn-sm btn-delete" data-id="<%= user._id %>">
                Supprimer
              </button>
              <% if (!user.isBanned) { %>
                <button class="btn btn-sm btn-ban" data-id="<%= user._id %>">
                  Bannir
                </button>
              <% } else { %>
                <button class="btn btn-sm btn-unban" data-id="<%= user._id %>">
                  Débannir
                </button>
              <% } %>
            <% } %>
          </td>
        </tr>
      <% }); %>
    </tbody>
  </table>
</div>

<script>
document.querySelectorAll('.btn-promote').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const userId = e.target.dataset.id;
    const res = await fetch('/admin/users/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.success) {
      location.reload();
    } else {
      alert('Erreur: ' + data.message);
    }
  });
});

document.querySelectorAll('.btn-delete').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    const userId = e.target.dataset.id;
    const res = await fetch(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      location.reload();
    } else {
      alert('Erreur: ' + data.message);
    }
  });
});

document.querySelectorAll('.btn-ban').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const userId = e.target.dataset.id;
    const reason = prompt('Raison du bannissement ?');
    if (!reason) return;
    const res = await fetch('/admin/users/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    const data = await res.json();
    if (data.success) {
      location.reload();
    } else {
      alert('Erreur: ' + data.message);
    }
  });
});
</script>
```

---

## Résumé des changements

| Fichier | Changement | Bénéfice |
|---------|-----------|----------|
| `models/User.js` | Ajout de champs (isSuperAdmin, profile, isActive, etc.) | Plus de données, audit |
| `middleware/auth.js` | Créer un nouveau fichier | Middleware réutilisable |
| `controllers/authController.js` | Créer un nouveau fichier | Logique métier séparée |
| `controllers/adminController.js` | Créer un nouveau fichier | Contrôleurs propres |
| `routes/authRoutes.js` | Créer un nouveau fichier | Routes organisées |
| `routes/adminRoutes.js` | Créer un nouveau fichier | Routes admin protégées |
| `app.js` | Utiliser les middlewares et routes | Moins de code en ligne |
| `views/admin.ejs` | Ajouter UI + fetch pour actions | Interface admin moderne |

---

## Améliorations futures possibles

1. **Role-Based Access Control (RBAC)** : Passer à `role: 'user' | 'moderator' | 'admin' | 'super-admin'`.
2. **Permissions granulaires** : Chaque rôle a un tableau de permissions (`can_delete_user`, `can_edit_proposition`, etc.).
3. **Audit logs** : Chaque action sensible est enregistrée dans une collection `AuditLog`.
4. **2FA** : Two-Factor Authentication pour les admins.
5. **Rate limiting** : Limiter les tentatives de login.
6. **Email verification** : Confirmer l'email avant d'activer le compte.
7. **Password reset** : Système de réinitialisation de mot de passe.
8. **Activity logs** : Afficher l'historique des connexions d'un utilisateur.

---

## Testing (Jest example)

```javascript
// test/admin.test.js
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

describe('Admin Panel', () => {
  let adminUser, normalUser, adminSession;
  
  beforeAll(async () => {
    // Créer un admin
    adminUser = await User.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'password123',
      isAdmin: true
    });
    
    // Créer un user normal
    normalUser = await User.create({
      username: 'user',
      email: 'user@test.com',
      password: 'password123'
    });
  });
  
  describe('GET /admin/dashboard', () => {
    it('should deny access to non-admin users', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .expect(401); // Non authentifié
    });
    
    it('should allow admin to view dashboard', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set('Cookie', `sessionId=${adminSession}`)
        .expect(200);
      
      expect(res.text).toContain('Tableau de bord');
    });
  });
  
  describe('POST /admin/users/promote', () => {
    it('should promote a user to admin', async () => {
      const res = await request(app)
        .post('/admin/users/promote')
        .set('Cookie', `sessionId=${adminSession}`)
        .send({ userId: normalUser._id })
        .expect(200);
      
      expect(res.body.success).toBe(true);
      
      const updatedUser = await User.findById(normalUser._id);
      expect(updatedUser.isAdmin).toBe(true);
    });
  });
});
```
