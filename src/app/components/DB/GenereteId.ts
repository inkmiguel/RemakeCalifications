export const generarID = (tamaño: number): string => {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  let id = '';
  const totalLetras = letras.length;
  
  for (let i = 0; i < tamaño; i++) {
    id += letras.charAt(Math.floor(Math.random() * totalLetras));
  }
  
  return id;
};
