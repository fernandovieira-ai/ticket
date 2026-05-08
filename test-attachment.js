// Teste simples para verificar se a rota de anexos está funcionando
const ticketId = '42e5ac24-c3b9-4083-96da-d05af5854741';
const filename = '5b8cbe7f-39fe-4cc7-9f3b-a5e496478436.pdf';
const url = `/uploads/tickets/${ticketId}/${filename}`;

console.log('URL que deveria funcionar:', url);
console.log('Rota correspondente: app/uploads/tickets/[ticketId]/[filename]/route.ts');
console.log('\nPara testar:');
console.log('1. Acesse um ticket no navegador');
console.log('2. Tente clicar em um anexo');
console.log('3. Verifique os logs no console do servidor');