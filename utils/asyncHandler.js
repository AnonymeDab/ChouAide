// Petit wrapper pour attraper les erreurs dans les handlers async
module.exports = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
