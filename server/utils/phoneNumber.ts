export const formatPhoneNumber = (number: string): string => {
  if (!number?.length) return ''

  // Remove all non-numeric characters
  const cleanNumber = number.replace(/[^0-9]/g, '')

  // If number starts with 966, check if there's a zero after 966 and remove it
  if (cleanNumber.startsWith('966')) {
    // If there's a zero after 966, remove it
    if (cleanNumber.length > 3 && cleanNumber[3] === '0') {
      return `966${cleanNumber.substring(4)}`
    }
    return cleanNumber
  }

  // If number starts with 0, remove the first zero and add 966
  if (cleanNumber.startsWith('0')) {
    return `966${cleanNumber.substring(1)}`
  }

  // If number doesn't start with 0 or 966, add 966 prefix
  return `966${cleanNumber}`
}
