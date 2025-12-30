import { IResult } from 'mssql'
import { getConnection } from '../db'
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

const getCompanyHeader = async (): Promise<IResult<CompanyHeader>['recordset'][0] | null> => {
  if (companyHeaderData) {
    return companyHeaderData
  }

  try {
    const pool = await getConnection()
    const result = await QUERIES.companyHeader(pool.request())

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
