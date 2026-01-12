
const User = require('../models/User');

// Vérifie que l'utilisateur est authentifié via la session
const ensureAuthenticated = (req, res, next) => {
	if (req.session && req.session.userId) return next();
	return res.redirect('/auth/login');
};

// Vérifie que l'utilisateur est admin
const ensureAdmin = async (req, res, next) => {
	if (!req.session || !req.session.userId) return res.redirect('/auth/login');
	try {
		const user = await User.findById(req.session.userId).select('isAdmin');
		if (user && user.isAdmin) return next();
		return res.status(403).send('Accès réservé aux administrateurs.');
	} catch (err) {
		return res.redirect('/auth/login');
	}
};

module.exports = { ensureAuthenticated, ensureAdmin };

