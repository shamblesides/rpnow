import ImageDialog from './image-dialog.js';
import getContrast from './contrast.js';

export default  {
  template: `
    <div id="send-box" :class="messageBoxClass" :style="messageBoxStyle">

      <div id="voice-bar">
        <div id="click-to-change" title="Change character" @click="$emit('open-character-menu')">
          {{ currentVoiceName }}
        </div>
        <button class="icon-button" @click="$refs.imageDialog.open(null)">
          <span class="emoji">🖼️</span>
        </button>
        <a href="/format.html" target="_blank" class="icon-button">
          <span class="emoji">📝</span>
        </a>
      </div>

      <div id="typing-area">
        <textarea
          rows="3"
          placeholder="Type your message."
          maxlength="10000"
          :disabled="isMsgBoxSending"
          v-model="msgBoxText"
          @keydown.enter.ctrl.exact="($event.preventDefault(), submit())"
          @keydown.enter.exact="pressEnterToSend ? ($event.preventDefault(), submit()) : null"
          @input="resizeTextareaOnInput($event, 3, 6)"
        ></textarea>
        <template v-if="!isMsgBoxSending">
          <button class="icon-button" :disabled="!msgBoxValid" @click="submit">
            ➤
          </button>
        </template>
        <template v-if="isMsgBoxSending">
          <div id="send-loader-container">
            <span class="emoji">⏳</span>
          </div>
        </template>
      </div>

      <image-dialog ref="imageDialog" :send="send"></image-dialog>

    </div>
  `,
  components: {
    'image-dialog': ImageDialog,
  },
  props: [
    'charasById',
    'pressEnterToSend',
    'send',
    'voice',
  ],
  data() {
    return {
      msgBoxText: '',
      isMsgBoxSending: false,
    };
  },
  computed: {
    currentChara() {
      if (this.voice.type !== 'chara') return undefined;
      return this.charasById[this.voice.charaId]
    },
    currentVoiceName() {
      if (this.voice.type === 'narrator') return 'Narrator';
      if (this.voice.type === 'ooc') return 'Out of Character';
      return this.currentChara.name;
    },
    currentCharaColor() {
      if (this.voice.type !== 'chara') return undefined;
      return this.currentChara.color;
    },
    messageBoxClass() {
      return 'send-box-' + this.voice.type;
    },
    messageBoxStyle() {
      if (this.voice.type !== 'chara') return {};
      else return {
        'background-color': this.currentCharaColor,
        'color': getContrast(this.currentCharaColor),
      };
    },
    msgBoxValid() {
      return this.msgBoxText.trim().length > 0;
    },
  },
  methods: {
    applyShortcutsToMessage(msg) {
      if (msg.type !== 'ooc') {
        var oocShortcuts = [
          /^\({2,}\s*(.*?[^\s])\s*\)*$/g, // (( message text ))
          /^\{+\s*(.*?[^\s])\s*\}*$/g, // { message text }, {{ message text }}, ...
          /^\/\/\s*(.*[^\s])\s*$/g // //message text
        ];
        for (var i = 0; i < oocShortcuts.length; ++i) {
          var regex = oocShortcuts[i];
          var match = regex.exec(msg.content);
          if (match) {
            return { type: 'ooc', content: match[1] };
          }
        }
      }
      return msg;
    },
    submit() {
      if (!this.msgBoxValid) return;

      var wasFocused = (document.activeElement === document.querySelector('#typing-area textarea'));

      var data = {
        content: this.msgBoxText,
        type: this.voice.type,
        charaId: this.voice.charaId || undefined,
      };

      data = this.applyShortcutsToMessage(data);

      this.isMsgBoxSending = true;

      var _this = this;
      this.send(data)
        .then(function () {
          _this.msgBoxText = '';
          _this.isMsgBoxSending = false;
          if (wasFocused) _this.$nextTick(function () { document.querySelector('#typing-area textarea').focus() });
        })
        .catch(function () {
          _this.isMsgBoxSending = false;
        });
    },
    resizeTextareaOnInput($event, minRows, maxRows) {
      var el = $event.target;
      while (el.rows > minRows && el.scrollHeight <= el.offsetHeight) {
        el.rows = el.rows - 1;
      }
      while (el.rows < maxRows && el.scrollHeight > el.offsetHeight) {
        el.rows = el.rows + 1;
      }
    },
  }
};
