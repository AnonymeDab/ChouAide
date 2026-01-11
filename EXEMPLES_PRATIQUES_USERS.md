# Exemples pratiques : Gestion des utilisateurs

Ce fichier contient des exemples concrets et visuels pour mieux comprendre la gestion des rôles et permissions.

---

## 1. Hiérarchie des rôles (visual)

```
┌─────────────────────────────────────────────────────┐
│                  SUPER-ADMIN (Level 3)               │
│  - Créer/supprimer autres admins                    │
│  - Gérer tout (users, propositions, settings)       │
│  - Débannir les utilisateurs                        │
│  - Accéder aux logs d'audit                         │
└────────────────┬────────────────────────────────────┘
                 │ Accès à tout ce qui est en-dessous
┌────────────────▼────────────────────────────────────┐
│              ADMIN (Level 2)                         │
│  - Voir tous les utilisateurs                       │
│  - Bannir/débannir (sauf super-admin)               │
│  - Supprimer propositions                           │
│  - Modérer le contenu                               │
│  - Pas accès à supprimer d'autres admins            │
└────────────────┬────────────────────────────────────┘
                 │ Accès à tout ce qui est en-dessous
┌────────────────▼────────────────────────────────────┐
│              MODERATOR (Level 1.5)                   │
│  - Approuver/refuser propositions                   │
│  - Signaler contenu abusif                          │
│  - Voir commentaires/messages                       │
│  - Pas accès à supprimer des utilisateurs           │
└────────────────┬────────────────────────────────────┘
                 │ Accès à tout ce qui est en-dessous
┌────────────────▼────────────────────────────────────┐
│              USER (Level 1)                          │
│  - Voir catalogue de propositions                   │
│  - Créer une proposition                            │
│  - Contacter autres utilisateurs                    │
│  - Modifier son profil                              │
│  - Commenter/noter                                  │
└────────────────┬────────────────────────────────────┘
                 │ Accès à tout ce qui est en-dessous
┌────────────────▼────────────────────────────────────┐
│              GUEST (Level 0)                         │
│  - Voir contenu public                              │
│  - S'inscrire / Se connecter                        │
│  - Lire mais pas créer                              │
└─────────────────────────────────────────────────────┘
```

---

## 2. Table de permissions (Matrice d'accès)

```javascript
const PERMISSIONS = {
  // Lecture
  view_users: { user: false, moderator: false, admin: true, superAdmin: true },
  view_propositions: { user: true, moderator: true, admin: true, superAdmin: true },
  view_comments: { user: true, moderator: true, admin: true, superAdmin: true },
  
  // Création
  create_proposition: { user: true, moderator: true, admin: true, superAdmin: true },
  create_comment: { user: true, moderator: true, admin: true, superAdmin: true },
  
  // Modification
  edit_own_profile: { user: true, moderator: true, admin: true, superAdmin: true },
  edit_other_profile: { user: false, moderator: false, admin: true, superAdmin: true },
  edit_proposition: { user: 'own', moderator: true, admin: true, superAdmin: true },
  
  // Suppression
  delete_own_account: { user: true, moderator: true, admin: false, superAdmin: false },
  delete_other_user: { user: false, moderator: false, admin: 'non-admin', superAdmin: true },
  delete_proposition: { user: 'own', moderator: true, admin: true, superAdmin: true },
  delete_comment: { user: 'own', moderator: true, admin: true, superAdmin: true },
  
  // Modération
  ban_user: { user: false, moderator: false, admin: true, superAdmin: true },
  unban_user: { user: false, moderator: false, admin: false, superAdmin: true },
  approve_proposition: { user: false, moderator: true, admin: true, superAdmin: true },
  close_proposition: { user: false, moderator: true, admin: true, superAdmin: true },
  
  // Admin
  promote_user: { user: false, moderator: false, admin: false, superAdmin: true },
  demote_user: { user: false, moderator: false, admin: false, superAdmin: true },
  view_logs: { user: false, moderator: false, admin: false, superAdmin: true },
  manage_settings: { user: false, moderator: false, admin: false, superAdmin: true }
};
```

---

## 3. Exemples de scénarios réels (ChouAide)

### Scénario 1 : Un utilisateur crée une proposition
```javascript
// Flux :
1. User (Alice) visite /proposer
2. Remplir le formulaire (nom, compétence, email, etc.)
3. POST /proposer
4. Système crée Proposition dans la BD

// Code backend :
app.post('/proposer', requireAuth, async (req, res) => {
  const { nom, competence, dispo, niveau, email, titre, description } = req.body;
  
  const proposition = new Proposition({
    nom,
    competence,
    dispo,
    niveau,
    email,
    titre,
    description,
    userId: req.user._id, // L'ID de l'user connecté
    status: 'pending' // En attente de modération
  });
  
  await proposition.save();
  
  // Ajouter la proposition au profil de l'utilisateur
  req.user.propositions.push(proposition._id);
  await req.user.save();
  
  res.redirect('/merci');
});

// Seul l'utilisateur connecté (Level >= 1) peut proposer
```

### Scénario 2 : Un moderator approuve une proposition
```javascript
// Flux :
1. Moderator (Bob) visite /admin/propositions
2. Voit la proposition d'Alice en "pending"
3. Clique "Approuver"
4. Proposition passe au status "approved"
5. Elle devient visible pour tous

// Code backend :
app.post('/admin/propositions/approve/:id', requireRole('moderator'), async (req, res) => {
  const proposition = await Proposition.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() },
    { new: true }
  );
  
  res.json({ success: true, message: 'Proposition approuvée', proposition });
});

// Seuls les moderators (Level >= 1.5) peuvent approuver
```

### Scénario 3 : Un admin bannit un utilisateur problématique
```javascript
// Flux :
1. Admin (Carol) reçoit un signalement sur l'utilisateur "Troll"
2. Va sur /admin/users
3. Clique "Bannir" sur le compte Troll
4. Rentre une raison : "Harcèlement d'autres utilisateurs"
5. Utilisateur ne peut plus se connecter

// Code backend :
app.post('/admin/users/ban/:id', requireRole('admin'), async (req, res) => {
  const { reason } = req.body;
  
  const user = await User.findById(req.params.id);
  user.ban(reason);
  user.isActive = false;
  await user.save();
  
  // Logger l'action
  await AuditLog.create({
    action: 'user_banned',
    by: req.user._id,
    target: user._id,
    reason,
    timestamp: new Date()
  });
  
  res.json({ success: true, message: 'Utilisateur banni' });
});

// Message à l'utilisateur banni :
if (user.isBanned) {
  return res.render('login', {
    message: `Votre compte a été banni le ${user.banDate.toLocaleDateString()}. 
               Raison: ${user.banReason}. Contactez support@chouaide.fr`
  });
}

// Seuls les admins (Level >= 2) peuvent bannir
```

### Scénario 4 : Super-admin promeut un admin
```javascript
// Flux :
1. Super-admin (Dave) va sur /admin/users
2. Voit Alice (User) et clique "Promouvoir en Admin"
3. Alice devient admin
4. Alice peut maintenant accéder à /admin

// Code backend :
app.post('/admin/users/promote/:id', requireRole('super-admin'), async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  
  if (targetUser.isAdmin) {
    return res.status(400).json({ success: false, message: 'Déjà admin' });
  }
  
  targetUser.isAdmin = true;
  await targetUser.save();
  
  // Log audit
  await AuditLog.create({
    action: 'user_promoted',
    by: req.user._id,
    target: targetUser._id,
    timestamp: new Date()
  });
  
  // Email à Alice
  await sendEmail(targetUser.email, 
    'Vous avez été promu(e) administrateur',
    `Bienvenue au panel admin! Accédez à /admin avec votre compte.`
  );
  
  res.json({ success: true, message: `${targetUser.username} est maintenant admin` });
});

// Seuls les super-admins (Level >= 3) peuvent promouvoir
```

### Scénario 5 : Utilisateur essaie d'accéder à une route admin
```javascript
// Flux :
1. User (Eve) essaie d'aller à /admin
2. Middleware `requireAdmin` intercepte
3. Vérifie si req.user.isAdmin === true
4. C'est false, donc renvoie 403

// Middleware :
async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  
  const user = await User.findById(req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).render('error', { 
      message: 'Accès réservé aux administrateurs' 
    });
  }
  
  req.user = user;
  next();
}

// Résultat : Eve reçoit une page d'erreur 403
```

---

## 4. Code complet : Créer un nouvel utilisateur avec vérification

```javascript
// Service pour créer un utilisateur
// services/userService.js

const User = require('../models/User');

class UserService {
  /**
   * Enregistrer un nouvel utilisateur
   * @param {Object} userData { username, email, password, passwordConfirm }
   * @returns {Promise<User>}
   */
  static async registerUser(userData) {
    const { username, email, password, passwordConfirm } = userData;
    
    // 1. Validations de base
    if (!username || !email || !password) {
      throw new Error('Tous les champs sont requis');
    }
    
    if (password !== passwordConfirm) {
      throw new Error('Les mots de passe ne correspondent pas');
    }
    
    if (password.length < 8) {
      throw new Error('Le mot de passe doit faire au moins 8 caractères');
    }
    
    // 2. Vérifier que l'utilisateur n'existe pas déjà
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      throw new Error(
        existingUser.email === email 
          ? 'Cet email est déjà utilisé' 
          : 'Ce nom d\'utilisateur est déjà utilisé'
      );
    }
    
    // 3. Créer le nouvel utilisateur
    const newUser = new User({
      username,
      email,
      password, // Sera hashé automatiquement par le hook pre('save')
      isAdmin: false, // Tous les nouveaux users sont des utilisateurs simples
      isSuperAdmin: false
    });
    
    await newUser.save();
    
    // 4. Retourner l'utilisateur (sans le password)
    return {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      isAdmin: newUser.isAdmin
    };
  }
  
  /**
   * Connecter un utilisateur
   * @param {Object} credentials { email, password }
   * @returns {Promise<Object>} { user, sessionData }
   */
  static async loginUser(credentials) {
    const { email, password } = credentials;
    
    if (!email || !password) {
      throw new Error('Email et mot de passe requis');
    }
    
    // Chercher l'utilisateur
    const user = await User.findOne({ email });
    
    if (!user) {
      throw new Error('Email ou mot de passe incorrect');
    }
    
    // Vérifier le password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error('Email ou mot de passe incorrect');
    }
    
    // Vérifier si l'utilisateur est banni
    if (user.isBanned) {
      throw new Error(
        `Votre compte a été banni le ${user.banDate.toLocaleDateString('fr-FR')}. 
         Raison: ${user.banReason}. 
         Contactez support@chouaide.fr pour plus d'informations.`
      );
    }
    
    // Enregistrer la connexion
    user.recordLogin();
    await user.save();
    
    return {
      userId: user._id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      redirectTo: user.isAdmin ? '/admin' : '/'
    };
  }
  
  /**
   * Obtenir les permissions d'un utilisateur
   * @param {ObjectId} userId
   * @returns {Promise<Object>}
   */
  static async getUserPermissions(userId) {
    const user = await User.findById(userId);
    
    if (!user) throw new Error('Utilisateur introuvable');
    
    const permissions = {
      canViewAdmin: user.isAdmin || user.isSuperAdmin,
      canPromoteUsers: user.isSuperAdmin,
      canDemoteUsers: user.isSuperAdmin,
      canDeleteUsers: user.isSuperAdmin,
      canBanUsers: user.isAdmin || user.isSuperAdmin,
      canUnbanUsers: user.isSuperAdmin,
      canViewLogs: user.isSuperAdmin,
      canManageSettings: user.isSuperAdmin,
      canApprovePropositions: user.isAdmin || user.isSuperAdmin,
      canEditOthersProfile: user.isAdmin || user.isSuperAdmin
    };
    
    return permissions;
  }
}

module.exports = UserService;
```

---

## 5. Flux d'authentification complet (diagram)

```
┌─────────────────────────────────────────────────────────────┐
│ UTILISATEUR VISITE LE SITE                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────▼─────────┐
              │ Session existe ?  │
              └────────┬──────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
    ┌───▼───┐                     ┌──▼──┐
    │  OUI  │                     │ NON │
    └───┬───┘                     └──┬──┘
        │                             │
        │ [Session ID]                │ Utilisateur = GUEST (Level 0)
        │ Récupère User en BD         │
        │                             │
    ┌───▼──────────────────┐      ┌──▼────────────────┐
    │ Utilisateur trouvé ? │      │ Affiche:           │
    └───┬──────────────────┘      │ - Page publique    │
        │                         │ - Lien "Login"     │
        │                         │ - Lien "Register"  │
    ┌───┴───────┬─────────────┐   └──────┬─────────────┘
    │           │             │          │
┌───▼──┐   ┌───▼───┐     ┌──▼───┐       │
│ OUI  │   │  NON  │     │      │       │
└───┬──┘   └───┬───┘     └──┬───┘       │
    │          │             │          │
    │    Détruit la    Détruit la       │
    │    session      session           │
    │    Redirige     Redirige          │
    │    /login       /login            │
    │                                   │
    │   ┌─────────────────┐             │
    │   │ Est banni ?     │             │
    │   └──┬────────┬─────┘             │
    │      │        │                   │
    │   ┌──▼──┐  ┌──▼──┐                │
    │   │ OUI │  │ NON │                │
    │   └──┬──┘  └──┬──┘                │
    │      │        │                   │
    │   Refuse  Continue                │
    │   login      │                    │
    │              │                    │
    │      ┌───────▼─────────┐          │
    │      │ Est admin ?     │          │
    │      └───┬────────┬────┘          │
    │          │        │               │
    │      ┌───▼──┐  ┌──▼────┐          │
    │      │ OUI  │  │  NON   │         │
    │      └───┬──┘  └───┬────┘         │
    │          │         │              │
    │      Redir.    Redir.            │
    │      /admin    /                 │
    │              (User Level 1)       │
    │                                   │
    └───────────────────────────────────┘
```

---

## 6. Checker les permissions (Helper)

```javascript
// utils/permissionHelper.js

class PermissionHelper {
  /**
   * Vérifier si un utilisateur peut effectuer une action
   * @param {User} user
   * @param {string} action
   * @param {Object} context - contexte additionnel (targetUser, proposition, etc.)
   * @returns {boolean}
   */
  static canPerformAction(user, action, context = {}) {
    const checks = {
      // Admin checks
      'view_admin_panel': () => user.isAdmin || user.isSuperAdmin,
      'promote_user': () => user.isSuperAdmin,
      'demote_user': () => user.isSuperAdmin,
      'ban_user': () => user.isAdmin || user.isSuperAdmin,
      'unban_user': () => user.isSuperAdmin,
      'delete_user': () => {
        // Ne peut pas se supprimer soi-même
        if (user._id.toString() === context.targetUser?._id.toString()) return false;
        // Super-admin peut supprimer quiconque
        if (user.isSuperAdmin) return true;
        // Admin peut supprimer les users simples seulement
        if (user.isAdmin && !context.targetUser?.isAdmin) return true;
        return false;
      },
      
      // Proposition checks
      'create_proposition': () => user && !user.isBanned,
      'edit_proposition': () => {
        // Propriétaire peut éditer sa proposition
        if (user._id.toString() === context.proposition?.userId.toString()) return true;
        // Admin peut éditer n'importe quelle proposition
        if (user.isAdmin || user.isSuperAdmin) return true;
        return false;
      },
      'delete_proposition': () => {
        // Propriétaire peut supprimer sa proposition
        if (user._id.toString() === context.proposition?.userId.toString()) return true;
        // Admin peut supprimer n'importe quelle proposition
        if (user.isAdmin || user.isSuperAdmin) return true;
        return false;
      },
      'approve_proposition': () => user.isAdmin || user.isSuperAdmin,
      
      // Profile checks
      'edit_profile': () => {
        // Chacun peut éditer son profil
        if (user._id.toString() === context.targetUser?._id.toString()) return true;
        // Admin peut éditer n'importe quel profil
        if (user.isAdmin || user.isSuperAdmin) return true;
        return false;
      },
      'view_user_profile': () => true, // Tous peuvent voir les profils publics
      
      // Default
      'default': () => false
    };
    
    const check = checks[action] || checks['default'];
    return check();
  }
  
  /**
   * Obtenir le message d'erreur pour une permission refusée
   */
  static getDeniedMessage(action) {
    const messages = {
      'view_admin_panel': 'Vous devez être administrateur pour accéder à cette page.',
      'promote_user': 'Seuls les super-administrateurs peuvent promouvoir des utilisateurs.',
      'ban_user': 'Vous n\'avez pas la permission de bannir cet utilisateur.',
      'create_proposition': 'Votre compte a été banni et ne peut plus créer de propositions.',
      'edit_proposition': 'Vous ne pouvez éditer que votre propre proposition.',
      'delete_proposition': 'Vous ne pouvez supprimer que votre propre proposition.',
      'edit_profile': 'Vous ne pouvez éditer que votre propre profil.',
      'default': 'Vous n\'avez pas la permission d\'effectuer cette action.'
    };
    
    return messages[action] || messages['default'];
  }
}

module.exports = PermissionHelper;
```

**Utilisation:**
```javascript
// Dans un contrôleur
const PermissionHelper = require('../utils/permissionHelper');

router.post('/propositions/:id/edit', requireAuth, async (req, res) => {
  const proposition = await Proposition.findById(req.params.id);
  
  if (!PermissionHelper.canPerformAction(req.user, 'edit_proposition', { proposition })) {
    return res.status(403).json({
      success: false,
      message: PermissionHelper.getDeniedMessage('edit_proposition')
    });
  }
  
  // Éditer la proposition
  proposition.titre = req.body.titre;
  await proposition.save();
  
  res.json({ success: true, proposition });
});
```

---

## 7. Test avec CURL / Postman

```bash
# 1. Inscription
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "password": "password123",
    "passwordConfirm": "password123"
  }'

# Réponse : 201 Créé + session cookie

# 2. Connexion
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "password123"
  }' \
  -c cookies.txt  # Sauvegarder les cookies

# Réponse : 200 OK + session cookie

# 3. Accéder à /admin (sans être admin)
curl http://localhost:3000/admin \
  -b cookies.txt

# Réponse : 403 Forbidden "Accès réservé aux administrateurs"

# 4. Si admin, créer une proposition
curl -X POST http://localhost:3000/proposer \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "nom": "Alice",
    "competence": "Nettoyage",
    "email": "alice@example.com",
    "titre": "Nettoyage professionnel",
    "description": "Je propose des services de nettoyage"
  }'

# 5. Promouvoir l'utilisateur (super-admin seulement)
curl -X POST http://localhost:3000/admin/users/promote \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": "user_id_here"
  }'

# 6. Bannir l'utilisateur (admin+)
curl -X POST http://localhost:3000/admin/users/ban \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": "user_id_here",
    "reason": "Harcèlement d\'autres utilisateurs"
  }'

# 7. Déconnexion
curl http://localhost:3000/auth/logout \
  -b cookies.txt \
  -L  # Suivre les redirects
```

---

## 8. Résumé en une table

| Action | Guest | User | Admin | Super-Admin |
|--------|-------|------|-------|------------|
| Voir le site | ✅ | ✅ | ✅ | ✅ |
| Créer proposition | ❌ | ✅ | ✅ | ✅ |
| Éditer sa proposition | ❌ | ✅ | ✅ | ✅ |
| Éditer autre proposition | ❌ | ❌ | ✅ | ✅ |
| Approuver proposition | ❌ | ❌ | ✅ | ✅ |
| Voir tous les users | ❌ | ❌ | ✅ | ✅ |
| Bannir un user | ❌ | ❌ | ✅ | ✅ |
| Promouvoir en admin | ❌ | ❌ | ❌ | ✅ |
| Supprimer un user | ❌ | ❌ | ✅* | ✅ |
| Voir audit logs | ❌ | ❌ | ❌ | ✅ |

*Admin peut supprimer des users simples seulement.

---

## Fichiers à créer/modifier (ChouAide)

```
ChouAide/
├── models/
│   ├── User.js              ← MODIFIER (ajouter champs)
│   ├── Proposition.js       ← MODIFIER (ajouter userId, status)
│   └── AuditLog.js          ← CRÉER (logs d'audit)
├── middleware/
│   └── auth.js              ← CRÉER (middlewares)
├── controllers/
│   ├── authController.js    ← CRÉER
│   └── adminController.js   ← CRÉER
├── routes/
│   ├── authRoutes.js        ← CRÉER
│   └── adminRoutes.js       ← CRÉER
├── utils/
│   └── permissionHelper.js  ← CRÉER
├── services/
│   └── userService.js       ← CRÉER
├── views/
│   ├── admin.ejs            ← MODIFIER
│   ├── users.ejs            ← CRÉER
│   ├── login.ejs            ← MODIFIER
│   └── register.ejs         ← MODIFIER
├── app.js                   ← MODIFIER (intégrer routes)
└── COURS_GESTION_UTILISATEURS.md     (ce que vous lisez)
```

C'est un bon point de départ pour un système de gestion des utilisateurs robuste !
