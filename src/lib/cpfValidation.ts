/**
 * Validação de CPF com dígitos verificadores.
 *
 * Regras:
 * - Aceita CPF formatado (000.000.000-00) ou apenas dígitos.
 * - Rejeita CPFs com todos os dígitos iguais (ex.: 111.111.111-11).
 * - Valida os dois dígitos verificadores conforme algoritmo da Receita Federal.
 * - Retorna os dígitos limpos (11 caracteres) se válido, null se inválido.
 * - Retorna null para entrada vazia/null/undefined (não lança).
 */
export function validateCpf(input: string | null | undefined): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11) return null;

  // Rejeita CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(digits)) return null;

  // Cálculo dos dígitos verificadores
  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) {
      sum += parseInt(digits[i], 10) * (factor - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const dv1 = calc(10);
  const dv2 = calc(11);

  if (dv1 !== parseInt(digits[9], 10) || dv2 !== parseInt(digits[10], 10)) {
    return null;
  }

  return digits;
}

/**
 * Formata um CPF limpo (11 dígitos) para exibição: 000.000.000-00.
 * Retorna null se a entrada não tiver exatamente 11 dígitos.
 */
export function formatCpf(digits: string | null | undefined): string | null {
  if (!digits) return null;
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length !== 11) return null;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
}
