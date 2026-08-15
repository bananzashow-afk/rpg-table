/**
 * Server-side permission helpers.
 * Visibility rules live in @rpg-table/shared so client UI and server stay aligned
 * on *what is allowed to request* — delivery filtering still happens only here
 * via recipientsForRoll / filterHistoryForViewer.
 */
export {
  allowedVisibilitiesForRole,
  canAccessCharacter,
  canUseVisibility,
  canViewerSeeRoll,
} from '@rpg-table/shared';

export { recipientsForRoll, filterHistoryForViewer, charactersForViewer } from '../rooms/types.js';
