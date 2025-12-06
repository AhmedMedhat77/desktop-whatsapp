import axios from 'axios'

const APP_URL = import.meta.env?.APP_URL || 'http://localhost:3000'
const ADMIN_URL = import.meta.env?.ADMIN_URL || 'http://127.0.0.1:9001'

const appAPI = axios.create({
  baseURL: APP_URL
})

const adminApi = axios.create({
  baseURL: ADMIN_URL
})

// adminApi.interceptors.request.use((config) => {
//   const token = localStorage.getItem('token')
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`
//   }
//   return config
// })
export { appAPI as api, adminApi }
