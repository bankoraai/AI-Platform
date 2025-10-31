export type Account = {
    id?: string
    name?: string
    iban?: string
    balance?: number
    currency?: string
    [key: string]: unknown
}

export type AccountBalance = {
    id: string
    available?: number
    current?: number
    currency?: string
}

export type SavingsAccount = {
    id: string
    name: string
    balance: number
    rate: number
    currency: string
    accountId?: string
}

export type Loan = {
    id: string
    name: string
    principal: number
    outstanding: number
    rate: number
    payment: number
    currency: string
    accountId?: string
}


