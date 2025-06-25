// src/helpers/utils.ts

/**
 * Convierte segundos a milisegundos.
 * @param seconds - El número de segundos.
 * @returns El equivalente en milisegundos.
 */
export function parseToMilliseconds(seconds: number): number {
  return seconds * 1000;
}

/**
 * Genera un valor entero aleatorio dentro de un rango.
 * @param min - El valor mínimo (inclusive).
 * @param max - El valor máximo (inclusive).
 * @returns Un número entero aleatorio.
 */
export function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


export function validaCpfCnpj(val) {
  if (val.length == 11) {
    var cpf = val.trim();

    cpf = cpf.replace(/\./g, '');
    cpf = cpf.replace('-', '');
    cpf = cpf.split('');

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cpf.length > i; i++) {
      if (cpf[i - 1] != cpf[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p = 10; (cpf.length - 2) > i; i++, p--) {
      v1 += cpf[i] * p;
    }

    v1 = ((v1 * 10) % 11);

    if (v1 == 10) {
      v1 = 0;
    }

    if (v1 != cpf[9]) {
      return false;
    }

    for (var i = 0, p = 11; (cpf.length - 1) > i; i++, p--) {
      v2 += cpf[i] * p;
    }

    v2 = ((v2 * 10) % 11);

    if (v2 == 10) {
      v2 = 0;
    }

    if (v2 != cpf[10]) {
      return false;
    } else {
      return true;
    }
  } else if (val.length == 14) {
    var cnpj = val.trim();

    cnpj = cnpj.replace(/\./g, '');
    cnpj = cnpj.replace('-', '');
    cnpj = cnpj.replace('/', '');
    cnpj = cnpj.split('');

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cnpj.length > i; i++) {
      if (cnpj[i - 1] != cnpj[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p1 = 5, p2 = 13; (cnpj.length - 2) > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v1 += cnpj[i] * p1;
      } else {
        v1 += cnpj[i] * p2;
      }
    }

    v1 = (v1 % 11);

    if (v1 < 2) {
      v1 = 0;
    } else {
      v1 = (11 - v1);
    }

    if (v1 != cnpj[12]) {
      return false;
    }

    for (var i = 0, p1 = 6, p2 = 14; (cnpj.length - 1) > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v2 += cnpj[i] * p1;
      } else {
        v2 += cnpj[i] * p2;
      }
    }

    v2 = (v2 % 11);

    if (v2 < 2) {
      v2 = 0;
    } else {
      v2 = (11 - v2);
    }

    if (v2 != cnpj[13]) {
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(time) {
  await timeout(time);
}

export function firstDayOfMonth(month: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - month, 1);
};

export function lastDayOfMonth(month: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + month, 0);
};

export function dataAtualFormatada(data: {
  getDate: () => { (): any; new (): any; toString: { (): any; new (): any } };
  getMonth: () => number;
  getFullYear: () => any;
}) {
  const dia = data.getDate().toString(),
    diaF = dia.length == 1 ? "0" + dia : dia,
    mes = (data.getMonth() + 1).toString(),
    mesF = mes.length == 1 ? "0" + mes : mes,
    anoF = data.getFullYear();
  return diaF + "/" + mesF + "/" + anoF;
}

export function makeid(length: number) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function replaceAll(str: string, find: string | RegExp, replace: any) {
  return str.replace(new RegExp(find, "g"), replace);
}

export function formatDate(date: string) {
  return (
    date.substring(8, 10) +
    "/" +
    date.substring(5, 7) +
    "/" +
    date.substring(0, 4)
  );
}

export function sortfunction(a, b) {
  return a.dueDate.localeCompare(b.dueDate);
}


/**
 * Obtiene el timestamp de un mensaje en formato numérico de segundos.
 */
export const getTimestampMessage = (msgTimestamp: any): number => {
  return Number(msgTimestamp) || Math.floor(Date.now() / 1000);
};

export const keepOnlySpecifiedChars = (str: string) => {
  return str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚâêîôûÂÊÎÔÛãõÃÕçÇ!?.,;:\s]/g, "");
};


export function cleanStringForJSON(str: string) {
  return str.replace(/[\x00-\x1F"\\']/g, "");
}
