// The Buddies area (phase 7). Registers its own routes.
import { soon } from '../soon.js';
export function registerBuddies(router) { router.route('/buddies', () => soon('buddies')); }
