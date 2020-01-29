export default {
  template: `
    <div class="dialog-container overlay" @click="close" v-show="showing || isDialogSending">

      <div id="character-dialog" class="dialog" @click.stop v-show="showing">
        <div>
          <input placeholder="Name your character" type="text" maxlength="30" v-model="charaDialogName">
        </div>
        <div>
          <spectrum-colorpicker v-model="charaDialogColor"></spectrum-colorpicker>
        </div>
        <div>
          <button type="button" class="outline-button" @click="submit">Save</button>
          <button type="button" class="outline-button" @click="close">Cancel</button>
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
      showing: false,
      charaDialogId: null,
      charaDialogName: '',
      charaDialogColor: '#dddddd',
      isDialogSending: false,
    };
  },
  computed: {
    isValid() {
      return this.charaDialogName.trim().length > 0;
    },
  },
  methods: {
    open (chara) {
      if (chara != null) {
        this.charaDialogId = chara._id;
        this.charaDialogName = chara.name;
        this.charaDialogColor = chara.color;
      } else {
        this.charaDialogId = null;
        this.charaDialogName = '';
        // leave charaDialogColor as it was
      }
      this.showing = true;
    },
    close () {
      if (!this.isDialogSending) {
        this.showing = false;
      }
    },
    submit () {
      var _this = this;
      
      if (!this.isValid) return;

      var data = {
        _id: this.charaDialogId,
        name: this.charaDialogName,
        color: this.charaDialogColor,
      };

      this.showing = false;
      this.isDialogSending = true;

      this.send(data)
        .then(function (res) {
          if (_this.charaDialogId) {
            _this.$emit('edited', res);
          } else {
            _this.$emit('created', res);
          }
          _this.isDialogSending = false;
        })
        .catch(function () {
          _this.isDialogSending = false;
        });
    }
  },
  components: {
    'spectrum-colorpicker': function () {
      return import('./spectrum-colorpicker.js').then(function(module) {
        return module.default;
      })
    }
  }
};
