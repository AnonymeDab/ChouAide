
const User = require('../models/User');
const Proposition = require('../models/Proposition');
const asyncHandler = require('../utils/asyncHandler');

// Affiche le tableau de bord admin
exports.getAdminDashboard = asyncHandler(async (req, res) => {
	const users = await User.find().select('username email isAdmin');
	const propositions = await Proposition.find().sort({ date: -1 });
	res.render('admin', { users, propositions });
});

// Valide une proposition (ajoute/changement d'un champ validated)
exports.validateService = asyncHandler(async (req, res) => {
	const { serviceId } = req.params;
	await Proposition.findByIdAndUpdate(serviceId, { validated: true });
	res.redirect('/admin/services');
});

// Supprime ou marque comme refusée une proposition
exports.rejectService = asyncHandler(async (req, res) => {
	const { serviceId } = req.params;
	await Proposition.findByIdAndDelete(serviceId);
	res.redirect('/admin/services');
});

// Liste des services proposés
exports.getProposedServices = asyncHandler(async (req, res) => {
	const propositions = await Proposition.find().sort({ date: -1 });
	res.render('admin_services', { propositions });
});

// Liste des utilisateurs
exports.getUsers = asyncHandler(async (req, res) => {
	const users = await User.find().select('username email isAdmin');
	res.render('admin_users', { users });
});

// Supprime un utilisateur
exports.deleteUser = asyncHandler(async (req, res) => {
	const { userId } = req.params;
	// Empêcher la suppression de soi-même
	if (req.session && String(req.session.userId) === String(userId)) {
		return res.status(400).send('Impossible de supprimer votre propre compte');
	}
	await User.findByIdAndDelete(userId);
	res.redirect('/admin/utilisateurs');
});

// Statistiques simples
exports.getStatistics = asyncHandler(async (req, res) => {
	const userCount = await User.countDocuments();
	const propositionCount = await Proposition.countDocuments();
	res.render('admin_stats', { userCount, propositionCount });
});

// Paramètres (vue)
exports.getSettings = asyncHandler(async (req, res) => {
	res.render('admin_settings');
});

