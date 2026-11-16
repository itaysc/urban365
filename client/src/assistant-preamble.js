import { injectIntoGlobalHook } from '/@react-refresh';

// The same lines Vite puts in index.html. The front door is not that file,
// and the React plugin refuses to run a component without them.
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = (type) => type;
