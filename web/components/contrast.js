export default function contrast(color) {
  var rgb = color.match(/\w\w/g).map(function(n) { return parseInt(n, 16) });
  var brightness = (rgb[0]*299 + rgb[1]*587 + rgb[2]*114);
  return (brightness < 128*1000) ? 'white' : 'black';
}