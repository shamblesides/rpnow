import 'https://cdn.jsdelivr.net/npm/jquery@3.4.1/dist/jquery.min.js'
import 'https://cdn.jsdelivr.net/gh/bgrins/spectrum@1.8.0/spectrum.js'

/* global jQuery */

document.head.appendChild(Object.assign(document.createElement('link'), {
  rel: 'stylesheet', type: 'text/css', href: 'https://cdn.jsdelivr.net/gh/bgrins/spectrum@1.8.0/spectrum.css'
}));

export default {
  props: ['value'],
  render (h) {
    return h('input', { ref: 'colorpicker' })
  },
  mounted () {
    var _this = this;
    function emitInput (color) {
      _this.$emit('input', color.toHexString());
    }
    jQuery(this.$refs.colorpicker).spectrum({
      color: this.value,
      showInput: true,
      preferredFormat: "hex",
      move: emitInput,
      change: emitInput,
      hide: emitInput,
    });
  },
  watch: {
    value(value) {
      jQuery(this.$refs.colorpicker).spectrum('set', value);
    }
  }
}
