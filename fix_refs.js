const fs = require('fs');
const filePath = 'H:\\Development\\Nspire\\app\\src\\screens\\DeficiencyDetailScreen.tsx';
let code = fs.readFileSync(filePath, 'utf8');

const matchStr = \    if (!currentDeficiency) {
      Alert.alert('Error', 'Please select a deficiency');
      return;
    }\;

const proceedIndex = code.indexOf(matchStr);
const nextFunctionIndex = code.indexOf('return (', proceedIndex);

if (proceedIndex !== -1 && nextFunctionIndex !== -1) {
  let proceedBody = code.substring(proceedIndex, nextFunctionIndex);
  
  // Replace references
  proceedBody = proceedBody.replace(/selectedDeficiency\.name/g, 'currentDeficiency.name');
  proceedBody = proceedBody.replace(/selectedDeficiency\.severity/g, 'currentDeficiency.severity');
  proceedBody = proceedBody.replace(/selectedDeficiency\.detail/g, 'currentDeficiency.detail');
  proceedBody = proceedBody.replace(/\.\.\.selectedDeficiency/g, '...currentDeficiency');
  // There is also (selectedDeficiency?.severity || 'Moderate') in scoring
  proceedBody = proceedBody.replace(/selectedDeficiency\?\.severity/g, 'currentDeficiency?.severity');

  code = code.substring(0, proceedIndex) + proceedBody + code.substring(nextFunctionIndex);
  fs.writeFileSync(filePath, code);
  console.log('Patch applied successfully!');
} else {
  console.log('Could not find boundaries.');
}
