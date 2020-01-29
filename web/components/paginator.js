export default {
  template: `
    <div id="pager" v-else>
      <button class="icon-button" :disabled="pageNumber === 1" @click="goToPage(1)">
        ⇤
      </button>
      <button class="icon-button" :disabled="pageNumber === 1" @click="goToPage(pageNumber-1)">
        ←
      </button>

      <button class="icon-button" @click="showPageDialog=true">
        ⋮⋮⋮
      </button>

      <button class="icon-button" :disabled="!(pageNumber < pageCount)" @click="goToPage(pageNumber+1)">
        →
      </button>
      <button class="icon-button" :disabled="!(pageNumber < pageCount)" @click="goToPage(pageCount)">
        ⇥
      </button>

      <div class="dialog-container overlay" @click="showPageDialog=false" v-show="showPageDialog">
        <div id="page-dialog" class="dialog" @click.stop>

          <p v-if="pageCount === 0">
            Nothing has been written yet.
          </p>

          <div id="archive-index" v-else-if="pageCount > 0">
            <template v-for="n of pageCount">
              <a :href="'#'+n" :key="n" class="page-number-link" @click="showPageDialog=false">
                {{ n }}
              </a>
            </template>
          </div>

          <p v-else>
            Loading...
          </p>
        </div>
      </div>
    </div>
  `,
  props: [
    'pageCount',
    'pageNumber',
  ],
  data() {
    return {
      showPageDialog: false,
    }
  },
  methods: {
    goToPage(n) {
      // TODO we don't need a function or buttons for this; use <a href="#n"> instead
      location.hash = n;
    },
  }
}
