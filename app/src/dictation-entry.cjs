'use strict';
// Electron keeps its own require.main; the package entry must boot explicitly.
require('./dictation-main').boot(require('electron'));
