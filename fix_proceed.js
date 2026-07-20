const fs = require('fs');
const filePath = 'H:\\Development\\Nspire\\app\\src\\screens\\DeficiencyDetailScreen.tsx';
let code = fs.readFileSync(filePath, 'utf8');

const oldBlock = \  const handleProceed = async () => {
    if (!selectedDeficiency) {
      Alert.alert('Error', 'Please select a deficiency');
      return;
    }\;

const newBlock = \  const handleProceed = async () => {
    let currentDeficiency: any = null;
    
    if (isGeneralComment) {
      currentDeficiency = {
        name: 'General Comment',
        severity: 'N/A',
        detail: note || 'General observation',
        criteria: '',
        points: '0',
        repairBy: '',
        category: 'General'
      };
    } else if (isCustomEntry) {
      if (!customDeficiencyDetail) {
        Alert.alert('Error', 'Please enter details for the custom deficiency');
        return;
      }
      currentDeficiency = {
        name: customDeficiencyName || 'Custom Deficiency',
        severity: 'Moderate',
        detail: customDeficiencyDetail,
        criteria: customDeficiencyCriteria || '',
        points: '0',
        repairBy: '',
        category: 'Custom'
      };
    } else {
      currentDeficiency = selectedDeficiency;
    }

    if (!currentDeficiency) {
      Alert.alert('Error', 'Please select a deficiency');
      return;
    }\;

code = code.replace(oldBlock, newBlock);

const proceedIndex = code.indexOf(newBlock);
const nextFunctionIndex = code.indexOf('return (', proceedIndex);

if (proceedIndex !== -1 && nextFunctionIndex !== -1) {
  let proceedBody = code.substring(proceedIndex, nextFunctionIndex);
  proceedBody = proceedBody.replace('currentDeficiency = selectedDeficiency;', '###SELECTION###');
  proceedBody = proceedBody.replace(/selectedDeficiency/g, 'currentDeficiency');
  proceedBody = proceedBody.replace('###SELECTION###', 'currentDeficiency = selectedDeficiency;');
  
  code = code.substring(0, proceedIndex) + proceedBody + code.substring(nextFunctionIndex);
  fs.writeFileSync(filePath, code);
  console.log('Patch applied successfully!');
} else {
  console.log('Could not find the block boundaries.');
}
