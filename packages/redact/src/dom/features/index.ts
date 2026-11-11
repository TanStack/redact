// Register the optional features with the reconciler. Bundlers can substitute
// a feature's stub to leave its full implementation out of the bundle.
import './context';
import './forward-ref';
import './memo';
import './lazy';
import './suspense';
import './portal';
import './activity';
import { installClass } from './class';
installClass();
