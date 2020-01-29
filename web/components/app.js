import RpMessage from '../components/rp-message.js';
import SendBox from '../components/send-box.js';
import CharaDrawer from '../components/chara-drawer.js';
import Paginator from '../components/paginator.js';
import { syncToLocalStorage } from '../components/sync-to-localstorage.js'
import * as store from '../store.js';

var soundPromise = import('https://cdn.jsdelivr.net/npm/howler@2.1.3/dist/howler.min.js')
.then(function() {
  /* global Howl */
  return new Howl({
    src: ['https://cdn.glitch.com/0e12472f-d496-485a-a042-740bef658eb2%2Ftypewriter.mp3?v=1575714187192']
  })
})
function playSound () {
  soundPromise.then(function(sound) {
    sound.play();
  })
}

export default {
  template: `
    <div id="app" :class="{'dark-theme':nightMode}">
      <div id="main-column">
        <div id="chat-header">
          <button class="icon-button" @click="openMainMenu" title="Menu">
            ≡
          </button>
          <span>
            {{ documentTitle }}
          </span>
        </div>

        <template v-if="!pageNumber">
          <div id="connection-indicator" v-if="rp.error">
            ⚠️ Connection lost! {{ rp.error }}
          </div>
        </template>

        <paginator v-else
          :page-count="pageCount"
          :page-number="pageNumber"
        />

        <!-- CHAT -->
        <div class="messages" v-show="!pageNumber" ref="scrollPane" @scroll="onScroll">
          <p class="notice" v-if="rp.msgs && rp.msgs.length >= 60">
            To view older messages, <a href="#1">visit the archive.</a>
          </p>

          <div id="welcome" v-if="rp.msgs && rp.msgs.length === 0">
            <h3>Welcome to your new RP!</h3>
            <p>Give your friends the link to this page and start writing together!</p>
            <p>
              Already wrote a story on RPNow? <button @click="openImportDialog">Import it!</button>
            </p>
          </div>

          <template v-if="rp.msgs && charasById">
            <rp-message
              v-for="msg of rp.msgs"
              v-bind="msg"
              :key="msg._id"
              :chara="charasById[msg.charaId]"
              :press-enter-to-send="pressEnterToSend"
              :send="sendMessage"
              :get-history="messageHistoryGetter(msg._id)"
              :can-edit="true"
              @resize="rescrollToBottom"
            />
          </template>
        </div>

        <!-- ARCHIVE -->
        <div class="messages" v-show="pageNumber">
          <div class="notice" v-if="!page || !charasById">
            <span class="emoji">⏳</span> Loading messages...
          </div>
          
          <div class="notice" v-else-if="page.length === 0">
            Nothing on this page yet.
          </div>

          <template v-else>
            <rp-message
              v-for="msg of page"
              v-bind="msg"
              :key="msg._id"
              :chara="charasById[msg.charaId]"
              :press-enter-to-send="pressEnterToSend"
              :send="sendMessage"
              :get-history="messageHistoryGetter(msg._id)"
              :can-edit="true"
            />
          </template>
        </div>

        <send-box v-if="!pageNumber && charasById"
          :voice="currentVoice"
          :charas-by-id="charasById"
          :press-enter-to-send="pressEnterToSend"
          :send="sendMessage"
          @open-character-menu="$refs.charaDrawer.open()"
        />
      </div>

      <div id="main-menu" class="drawer drawer-left" :class="{open:showMainMenu}">
        <div class="overlay overlay-drawer" @click="showMainMenu=false"></div>

        <div class="drawer-header">
          Menu
          <button class="icon-button close-button" @click="showMainMenu=false" title="Close">×</button>
        </div>
        <div class="drawer-body">
          <a href="#1" class="drawer-item" v-if="!pageNumber" @click="showMainMenu=false">
            📚 Browse archive
          </a>
          <a href="#" class="drawer-item" v-if="pageNumber" @click="showMainMenu=false">
            ✍️ Back to chat
          </a>
          <button class="drawer-item" @click="openDownloadDialog">
            📃 Download .TXT
          </button>
          <hr/>
          <button class="drawer-item" @click="changeTitle">
            📓 Change title...
          </button>
          <button class="drawer-item" @click="openWebhookDialog">
            🌐 Add Discord webhook...
          </button>
          <a class="drawer-item" href="/api/rp/export" target="_blank">
            🗄️ Export data
          </a>
          <hr/>
          <label>
            🌒 Night mode
            <input type="checkbox" v-model="nightMode"/>
          </label>
          <label class="drawer-item">
            🔈 Audio Alerts
            <input type="checkbox" v-model="audioAlerts"/>
          </label>
          <label class="drawer-item">
            🔔 Desktop Alerts
            <input type="checkbox" v-model="browserAlerts"/>
          </label>
          <label class="drawer-item">
            ⏩ Quick send
            <input type="checkbox" v-model="pressEnterToSend"/>
          </label>
        </div>
      </div>

      <chara-drawer ref="charaDrawer"
        :current-voice="currentVoice"
        :charas="rp.charas"
        :send="sendChara"
        @select-voice="currentVoice = $event"
      ></chara-drawer>

      <div class="dialog-container overlay" @click="closeDownloadDialog" v-show="showDownloadDialog">
        <div id="download-dialog" class="dialog" @click.stop>
          <h4>Download RP</h4>
          <p>
            <label>
              <input type="checkbox" v-model="downloadOOC">
              Include OOC messages
            </label>
          </p>
          <div>
            <button type="button" class="outline-button" @click="downloadTxt">Download</button>
            <button type="button" class="outline-button" @click="closeDownloadDialog">Cancel</button>
          </div>
        </div>
      </div>

      <div class="dialog-container overlay" @click="closeImportDialog" v-show="showImportDialog">
        <div id="import-dialog" class="dialog" @click.stop>
          <h4>Import RP</h4>
          Import from file:<br/>
          <input type="file" ref="importFileInput" accept="application/json,.json"><br/><br/>
          <button @click="uploadJSON">Upload</button>
        </div>
      </div>

    </div>
  `,

  components: {
    'rp-message': RpMessage,
    'send-box': SendBox,
    'chara-drawer': CharaDrawer,
    'paginator': Paginator,
  },

  data() {
    return {
      // rp data
      rp: store.state,
      // archive page data
      pageCount: null,
      page: null,
      // rp ui
      isScrolledToBottom: true,
      document: store.webpage,
      unreadMessage: null,
      currentVoice: { type: 'narrator', charaId: null },
      // options
      pressEnterToSend: true,
      nightMode: false,
      audioAlerts: false,
      browserAlerts: false,
      // main menu
      showMainMenu: false,
      // download dialog
      showDownloadDialog: false,
      downloadOOC: true,
      // import dialog
      showImportDialog: false,
    }
  },

  created() {
    // sync certain properties on this component with values in localStorage
    syncToLocalStorage(this, {
      pressEnterToSend: 'rpnow.pressEnterToSend',
      nightMode: 'rpnow.nightMode',
      audioAlerts: 'rpnow.audioAlerts',
      browserAlerts: 'rpnow.browserAlerts',
      msgBoxText: 'rpnow.msgBoxText', // TODO sync in sendBox component
      currentVoice: 'rpnow.currentVoice',
      downloadOOC: 'rpnow.downloadOOC',
    });
    // if we open up on an archive page, load it
    if (this.pageNumber) {
      this.loadPage(this.pageNumber);
    }
  },

  computed: {
    // rp charas grouped by id
    charasById() {
      if (this.rp.charas == null) return null;

      return this.rp.charas.reduce(function (map, chara) {
        map[chara._id] = chara;
        return map;
      }, {});
    },
    documentTitle() {
      if (this.rp.title == null) return '';

      if (this.unreadMessage) return '* New post...';
      
      if (this.pageNumber) return `[Page ${this.pageNumber}] ${this.rp.title}`

      return this.rp.title;
    },
    isReadingChat() {
      return this.document.visible && !this.pageNumber && this.isScrolledToBottom;
    },
    pageNumber() {
      return +this.document.hash.slice(1);
    },
  },

  methods: {
    sendMessage() {
      var _this = this;
      return store.sendMessage.apply(null, arguments).then(function(msg) {
        // this extra callback makes it so that edits to the msg will be applied to archive pages as well
        // it might be useful to move this to the store later, as well as the whole page object..?
        
        if (!_this.page) return;
        
        var index = _this.page.findIndex(function(m) { return m._id === msg._id });
        if (index !== -1) {
          _this.page.splice(index, 1, msg);
        }
      });
    },
    sendChara: store.sendChara,
    messageHistoryGetter(_id) {
      return store.getMessageHistory.bind(null, _id);
    },
    changeTitle() {
      var title = prompt('Enter the title for this RP:', this.rp.title);
      if (title != null) {
        store.changeTitle(title);
      }
    },
    openWebhookDialog() {
      var webhook = prompt('Webhook URL, please:');
      if (webhook) {
        store.addWebhook(webhook)
        .then(function () {
          alert('Webhook added successfully')
        })
      }
    },
    openDownloadDialog() {
      this.showDownloadDialog = true;
    },
    closeDownloadDialog() {
      this.showDownloadDialog = false;
    },
    openImportDialog() {
      this.showImportDialog = true;
    },
    closeImportDialog() {
      this.showImportDialog = false;
    },
    downloadTxt() {
      if (this.downloadOOC) {
        window.open('/api/rp/download.txt?includeOOC=true', '_blank').focus();
      } else {
        window.open('/api/rp/download.txt', '_blank').focus();
      }
    },
    openMainMenu() {
      this.showMainMenu = true;
    },
    onScroll(scrollEvent) {
      var el = scrollEvent.currentTarget
      var bottomDistance = el.scrollHeight - el.scrollTop - el.offsetHeight;
      this.isScrolledToBottom = bottomDistance < 31;
    },
    rescrollToBottom() {
      if (!this.isScrolledToBottom || this.pageNumber) return;

      var _this = this;
      this.$nextTick(function () {
        var el = _this.$refs.scrollPane;
        el.scrollTop = el.scrollHeight - el.offsetHeight;
      });
    },
    loadPage(n) {
      var _this = this;
      store.getPage(n).then(function(data) {
        if (_this.pageNumber === n) { // if the user hasn't already navigated away
          _this.pageCount = data.pageCount;
          _this.page = data.msgs;
        }
      })
    },
    uploadJSON() {
      store.importJSON(this.$refs.importFileInput.files[0])
      .then(function(res) {
        alert('File successfully submitted for processing!')
      })
    },
  },

  watch: {
    // browser tab title
    'documentTitle'(title) {
      document.title = title;
    },
    // checks to make sure notifications are supported
    'browserAlerts'(on) {
      if (!on) return;

      var _this = this;
      if (!('Notification' in window)) {
        alert('Desktop notifications are not supported in this browser.');
        setTimeout(function() {
          _this.browserAlerts = false;
        }, 1);
      } else if (Notification.permission === 'denied') {
        alert("It seems like you've declined desktop notifications for this site. You'll need to change this in your browser settings.");
        setTimeout(function() {
          _this.browserAlerts = false;
        }, 1);
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(function (result) {
          if (result !== 'granted') {
            _this.browserAlerts = false;
          }
        });
      }
    },
    // actions for when a new message comes in
    'rp.msgs'(msgs, oldMsgs) {
      // sticky bottom
      this.rescrollToBottom();
      
      // if we are receiving a new message (as opposed to a message edit)...
      var hasNew = msgs && oldMsgs && (msgs[msgs.length-1]._id !== oldMsgs[oldMsgs.length-1]._id);
      if (hasNew && !this.isReadingChat) {
        this.unreadMessage = msgs[msgs.length - 1];
      }
    },
    // if we come back to the page, mark message as read
    'isReadingChat'(isReadingChat) {
      if (isReadingChat) {
        this.unreadMessage = null;
      }
    },
    // if there is a new unread message, do notifications
    'unreadMessage'(msg) {
      if (msg == null) return;
      
      // sound notification
      if (this.audioAlerts) {
        playSound();
      }

      // desktop notifications
      if (this.browserAlerts && !this.document.visible) {
        try {
          new Notification('New post from "' + this.rp.title + '"', {
            body: msg.content || undefined,
            icon: msg.url || undefined,
            tag: msg._id,
          });
        } catch (ex) {
          // Chrome on Android (at least Android 4-7) throws an error
          // "Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead."
          // No action needed
        }
      }
    },
    // if the current voice's chara is suddenly not
    // present (usually because the RP was reset) then
    // we must reset the currentVoice
    'charasById'(charasById) {
      if (charasById == null) return;

      if (this.currentVoice.type === 'chara' && charasById[this.currentVoice.charaId] == null) {
        this.currentVoice = { type: 'narrator', charaId: null };
      }
    },
    "pageNumber"(n) {
      this.page = null;
      
      if (!n) {
        // if going to the main chat, scroll to bottom
        this.rescrollToBottom();
      } else {
        // if going to a page, fetch it!
        this.loadPage(n);
      }
    }
  }
};
