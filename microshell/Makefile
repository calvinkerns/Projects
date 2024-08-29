CC = gcc
CFLAGS = -Wall -Wextra -g
OBJS = ush.o expand.o builtin.o strmod.o
SCR = script

ush: $(OBJS) $(CC) $(CFLAGS) -o ush $(OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c $<

run: ush
	./ush

clean:
	rm -f *.o *.aux *.ps *.html *.ps~ *.log
	rm -f cover.pdf ush.pdf builtin.pdf expand.pdf gradingScriptA4.pdf myTestingScript.pdf Makefile.pdf defn.pdf

script:
	script -O $(SCR)

cover: cover.tex
	pdflatex cover.tex

a2ps: ush.c
	a2ps ush.c -o ush.ps -1
	a2ps expand.c -o expand.ps -1
	a2ps builtin.c -o builtin.ps -1
	a2ps defn.h -o defn.ps -1
	a2ps Makefile -o Makefile.ps -1
	a2ps myTestingScript -o myTestingScript.ps -1
	a2ps gradingScriptA4 -o gradingScriptA4.ps -1
	

htmltopdf:
	ps2pdf myTestingScript.ps myTestingScript.pdf && \
	ps2pdf gradingScriptA4.ps gradingScriptA4.pdf && \
	ps2pdf ush.ps ush.pdf && \
	ps2pdf expand.ps expand.pdf && \
	ps2pdf defn.ps defn.pdf && \
	ps2pdf Makefile.ps Makefile.pdf && \
	ps2pdf builtin.ps builtin.pdf

generate: cover a2ps htmltopdf
	pdfunite cover.pdf ush.pdf expand.pdf builtin.pdf defn.pdf Makefile.pdf myTestingScript.pdf gradingScriptA4.pdf output.pdf && \
	make clean

#dependency list
$(OBJS): defn.h
