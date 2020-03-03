// TODO DELETE THIS FILE AND ITS DIRECTORY

export default {
  template: `
    <div class="dialog-container overlay" @click="showImageDialog=false" v-show="showImageDialog || isDialogSending">

      <div id="image-dialog" class="dialog" @click.stop v-show="showImageDialog">
        <div>
          <input type="url" ref="urlbox"
            required
            placeholder="Enter a URL"
            v-model="imageDialogUrl"
            @keydown.enter="sendImage"
          >
        </div>

        <div class="preview-container preview-container-busted" v-if="imageDialogIsChecking">
          <span class="emoji">⏳</span> Loading...
        </div>

        <div class="preview-container" v-if="imageDialogIsValid">
          <img :src="imageDialogUrl">
        </div>

        <div class="preview-container preview-container-busted" v-if="!imageDialogIsValid && !imageDialogIsChecking">
          <span v-if="imageDialogUrl.length === 0"></span>
          <span v-else-if="!$refs.urlbox.checkValidity()">Can't read this URL.</span>
          <span v-else>Can't load this image.</span>
        </div>

        <div>
          <button type="button" class="outline-button" @click="submit" :disabled="!imageDialogIsValid">Save</button>
          <button type="button" class="outline-button" @click="showImageDialog=false">Cancel</button>
        </div>
      </div>

      <template v-if="isDialogSending">
        <span class="emoji">⏳</span> Loading...
      </template>

    </div>
  `,
  props: [
    'send',
  ],
  data () {
    return {
      // image post dialog
      showImageDialog: false,
      imageDialogId: null,
      imageDialogUrl: '',
      imageDialogIsChecking: false,
      imageDialogIsValid: false,
      isDialogSending: false,
    };
  },
  methods: {
    open (msg) {
      if (msg != null) {
        this.imageDialogId = msg._id;
        this.imageDialogUrl = msg.url;
      } else {
        this.imageDialogId = null;
        this.imageDialogUrl = '';
      }
      this.showImageDialog = true;
    },
    submit () {
      if (!this.imageDialogIsValid) return;

      var data = {
        _id: this.imageDialogId,
        type: 'image',
        url: this.imageDialogUrl,
      };

      this.showImageDialog = false;
      this.isDialogSending = true;

      var _this = this;
      this.send(data)
        .then(function () {
          _this.isDialogSending = false;
        })
        .catch(function () {
          _this.isDialogSending = false;
        });
    }
  },
  watch: {
    // validate the image dialog to see if an image can actually be loaded
    imageDialogUrl (url) {
      if (!this.$refs.urlbox.checkValidity()) {
        this.imageDialogIsChecking = false;
        this.imageDialogIsValid = false;
        return;
      }

      this.imageDialogIsChecking = true;
      this.imageDialogIsValid = false;

      var _this = this;
      new Promise(function (resolve) {
        var img = document.createElement('img');

        img.addEventListener('load', function() { resolve(true) });
        img.addEventListener('error', function() { resolve(false) });
        img.addEventListener('abort', function() { resolve(false) });
        setTimeout(function() { resolve(false) }, 45000);

        img.src = url;
      }).then(function (result) {
        // ignore if another change has happened since this one
        if (_this.imageDialogUrl !== url) return;

        _this.imageDialogIsChecking = false;
        _this.imageDialogIsValid = result;
      });
    },
  },
};
  