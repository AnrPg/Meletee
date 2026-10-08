// The Grow area (phase 5): Method Lab, forgiving streak, done list and wins, weekly
// reflection, calm corner, "my why" and a garden that grows with real study.
// Each screen's module loads on first use (see lazy() in ../index.js); the activity log that
// feeds the garden starts with the app (startBackground in ../index.js).
export function registerGrow(router, lazy) {
  const lab = () => import('./lab.js');
  const calm = () => import('./calm.js');
  router.route('/grow', lazy(() => import('./home.js'), 'growHome'));
  router.route('/grow/lab', lazy(lab, 'labList'));
  router.route('/grow/lab/new', lazy(lab, 'labNew'));
  router.route('/grow/lab/new/:method', lazy(lab, 'labNew'));
  router.route('/grow/lab/:id', lazy(lab, 'labDetail'));
  router.route('/grow/methods', lazy(lab, 'methodsProfile'));
  router.route('/grow/wins', lazy(() => import('./wins.js'), 'winsView'));
  router.route('/grow/reflect', lazy(() => import('./reflect.js'), 'reflectView'));
  router.route('/grow/calm', lazy(calm, 'calmView'));
  router.route('/grow/calm/worry', lazy(calm, 'worryView'));
  router.route('/grow/calm/breathe', lazy(calm, 'breatheView'));
  router.route('/grow/why', lazy(() => import('./why.js'), 'whyView'));
}
