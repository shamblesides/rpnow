import 'https://cdn.jsdelivr.net/npm/vue@2.6.11/dist/vue.min.js'

/* global Vue */

import * as store from './store.js';
import App from './components/app.js'

store.initialize();

new Vue(App).$mount('#app')
