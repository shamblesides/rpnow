import CharaDialog from './chara-dialog.js';

export default {
  template: `
    <div id="character-menu" class="drawer drawer-right drawer-dock-1024" :class="{open: showing}">
      <div class="overlay overlay-drawer" @click="showing=false"></div>

      <div class="drawer-header">
        Characters
        <button class="icon-button close-button" @click="showing=false" title="Close">×</button>
      </div>
      <div class="drawer-body">
        <button :class="['drawer-item', {'selected': currentVoice.type==='narrator'}]" @click="selectCharacter('narrator')">
          📖 Narrator
        </button>
        <button :class="['drawer-item', {'selected': currentVoice.type==='ooc'}]" @click="selectCharacter('ooc')">
          💬 Out of Character
        </button>
        <hr/>
        <button class="drawer-item" @click="$refs.charaDialog.open(null)">
          🆕 New Character...
        </button>
        <hr/>
        <div v-for="chara of (charas || [])" :class="['drawer-item', {'selected': currentVoice.charaId===chara._id}]" @click="selectCharacter('chara', chara._id)" :key="chara._id">
          <span class="chara-icon-shadow" :style="{'color':chara.color}">⚉</span>
          {{ chara.name }}
          <button class="icon-button" @click.prevent.stop="$refs.charaDialog.open(chara)">✎</button>
        </div>
      </div>

      <chara-dialog ref="charaDialog"
        :send="send"
        @created="selectCharacter('chara', $event._id)"
      ></chara-dialog>
    </div>
  `,
  components: {
    'chara-dialog': CharaDialog,
  },
  props: [
    'charas',
    'currentVoice',
    'send',
  ],
  data () {
    return {
      showing: false,
    }
  },
  methods: {
    open () {
      this.showing = true;
    },
    selectCharacter (type, charaId) {
      this.$emit('select-voice', { type: type, charaId: charaId || null });
      if (window.matchMedia("(max-width: 1023px)").matches) {
        this.showing = false;
      }
    },
  }
};
