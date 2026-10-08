// The Grow area (phase 5). Registers its own routes.
import { soon } from '../soon.js';
export function registerGrow(router) { router.route('/grow', () => soon('grow')); }
