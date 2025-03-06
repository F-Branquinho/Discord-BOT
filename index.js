require('dotenv').config();  // Para ler as variáveis do .env

const { Client, GatewayIntentBits } = require('discord.js');
const moment = require('moment');  // Para trabalhar com datas
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});


client.once('ready', async () => {
    console.log(`Bot está online como ${client.user.tag}`);

    await lerAniversarios();
    agendarVerificacao(); 
});

const aniversarios = [];


async function lerAniversarios() {
    console.log('Lendo aniversários...');
    const canalAniversarios = await client.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID);

    if (!canalAniversarios) {
        console.log("Canal de aniversários não encontrado!");
        return;
    }

    const mensagens = await canalAniversarios.messages.fetch({ limit: 5 });

    if (mensagens.size === 0) {
        console.log("Nenhuma mensagem encontrada no canal de aniversários!");
        return;
    }

    const mensagem = mensagens.first();
    console.log(`Mensagem encontrada: ${mensagem.content}`);

    const regex = /(\d{2}\/\d{2})\s-\s<@(\d+)>/g;
    let match;

    while (match = regex.exec(mensagem.content)) {
        const diaMes = match[1];  // data (DD/MM)
        const userId = match[2];  // ID de usuário (<@ID>)
        
        aniversarios.push({ data: diaMes, userId });
        console.log(`Aniversário encontrado: ${diaMes} - ${userId}`);
    }
}

async function verificarAniversarios() {
    const dataAtual = moment().format('DD/MM');
    console.log(`Verificando aniversários para a data: ${dataAtual}`);
    
    aniversarios.forEach(async (aniversario) => {
        console.log(`Comparando: ${aniversario.data} com ${dataAtual}`);
        if (aniversario.data === dataAtual) {
            const canalGeral = client.channels.cache.get(process.env.GENERAL_CHANNEL_ID);
            if (canalGeral) {
                try {
                    const membro = await canalGeral.guild.members.fetch(aniversario.userId);
                    
                    if (membro) {
                        const userMention = `<@${membro.id}>`;
                        const mensagemAniversario = `🎉 Hoje é o teu dia, ${userMention}! 🎂 Feliz aniversário!`;
                        console.log(`Mensagem para enviar: ${mensagemAniversario}`);
                        canalGeral.send(mensagemAniversario);
                    } else {
                        console.log(`⚠ Usuário com ID "${aniversario.userId}" não encontrado no servidor!`);
                    }
                } catch (error) {
                    console.log(`⚠ Erro ao enviar mensagem de aniversário para ${aniversario.userId}:`, error.message);
                }
            } else {
                console.log('⚠ Canal geral não encontrado!');
            }
        }
    });
}

function agendarVerificacao() {
    const agora = moment();
    const horaDeVerificacao = moment().set({ hour: 0, minute: 1, second: 0 });

    if (agora.isAfter(horaDeVerificacao)) {
        horaDeVerificacao.add(1, 'day');
    }
    
    const tempoRestante = horaDeVerificacao.diff(agora); 

    console.log(`Agora: ${agora.format('HH:mm:ss')}`);
    console.log(`Hora de verificação: ${horaDeVerificacao.format('HH:mm:ss')}`);
    console.log(`Tempo restante até verificacao: ${tempoRestante / 1000} segundos`);

    setTimeout(() => {
        console.log("Executando verificação de aniversários...");
        verificarAniversarios(); 
        setInterval(verificarAniversarios, 86400000); 
    }, tempoRestante);
}

client.login(process.env.BOT_TOKEN);