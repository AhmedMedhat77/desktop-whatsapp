import { sql } from '../db'

import { QUERIES } from '../constants/queries'

type CompanyHeader = {
  pic: string
  CompanyArbName: string
  CompanyEngName: string
  ArbAddress: string
  EngAddress: string
  ArbTel: string
  EngTel: string
}

let companyHeaderData: CompanyHeader | null = null

const getCompanyHeader = async (): Promise<CompanyHeader | null> => {
  if (companyHeaderData) {
    return companyHeaderData
  }

  try {
    const result = await sql.query(QUERIES.companyHeader)

    if (result.recordset.length > 0) {
      companyHeaderData = result.recordset[0]
      return companyHeaderData
    }

    return null
  } catch (error) {
    console.error('Error fetching company header:', error)
    throw error
  }
}

const refreshCompanyHeader = async (): Promise<CompanyHeader | null> => {
  companyHeaderData = null
  return getCompanyHeader()
}

export const companyHeader = {
  getCompanyHeader,
  refreshCompanyHeader
}
