// The Grow area (phase 5): Method Lab, forgiving streak, done list and wins, weekly
// reflection, calm corner, "my why" and a garden that grows with real study.
import { growHome } from './home.js';
import { labList, labNew, labDetail, methodsProfile } from './lab.js';
import { winsView } from './wins.js';
import { reflectView } from './reflect.js';
import { calmView, worryView, breatheView } from './calm.js';
import { whyView } from './why.js';
import { listen } from '../../grow/data.js';

export function registerGrow(router) {
  listen(); // log workspace activity days app-wide
  router.route('/grow', growHome);
  router.route('/grow/lab', labList);
  router.route('/grow/lab/new', labNew);
  router.route('/grow/lab/new/:method', labNew);
  router.route('/grow/lab/:id', labDetail);
  router.route('/grow/methods', methodsProfile);
  router.route('/grow/wins', winsView);
  router.route('/grow/reflect', reflectView);
  router.route('/grow/calm', calmView);
  router.route('/grow/calm/worry', worryView);
  router.route('/grow/calm/breathe', breatheView);
  router.route('/grow/why', whyView);
}
